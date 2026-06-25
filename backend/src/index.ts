import { createServer } from 'node:http';

import express from 'express';

import { RuleBasedAnalyzer } from './analyzer/ruleBasedAnalyzer.js';
import { analyzerConfig } from './config/analyzerConfig.js';
import { mockEventConfig } from './config/mockEventConfig.js';
import { serverConfig } from './config/serverConfig.js';
import type { SecurityEvent } from './events/index.js';
import { startMockEventGenerator } from './mock/mockEventGenerator.js';
import { publishSecurityEvent, startEventPipeline } from './pipeline/eventPipeline.js';
import { securityEventRouter } from './routes/securityEventRoutes.js';
import { connectStorage } from './storage/postgres.js';
import { saveSecurityEvent } from './storage/securityEventRepository.js';
import { createDashboardWebSocketServer } from './websocket/dashboardWebSocketServer.js';

const app = express();

/**
 * Rule 기반 SecurityEvent Analyzer
 */
const ruleBasedAnalyzer = new RuleBasedAnalyzer(
  analyzerConfig,
);

// 서버 구현 기술 응답 헤더 노출 비활성화 (보조적인 정보 노출 감소 설정)
app.disable('x-powered-by');

/**
 * 애플리케이션 실행 상태 확인 API
 */
app.get('/health', (_request, response) => {
  response.status(200).json({
    status: 'ok',
    service: serverConfig.serviceName,
  });
});

// Storage 조회 API 연결
app.use('/api', securityEventRouter);

// Express 기반 HTTP 서버 생성
const server = createServer(app);

// 동일 HTTP 서버 기반 WebSocket 구성
const dashboardWebSocketServer = createDashboardWebSocketServer(server);

/**
 * Consumer 수신 이벤트 저장, 전달, 분석, Rule Hit 재발행
 */
const handleSecurityEvent = async (
  event: SecurityEvent,
): Promise<void> => {
  // SecurityEvent PostgreSQL 저장
  const inserted = await saveSecurityEvent(event);

  console.log(
    inserted
      ? `[storage] saved. eventType=${event.eventType} eventId=${event.eventId}`
      : `[storage] duplicate skipped. eventType=${event.eventType} eventId=${event.eventId}`,
  );

  // 신규 저장 이벤트 Dashboard 전달
  if (inserted) {
    dashboardWebSocketServer.broadcastSecurityEvent(
      event,
    );
  }

  // 기존 Analyzer 처리 유지
  const ruleHitEvents =
    ruleBasedAnalyzer.analyze(event);

  // 탐지 결과 기존 Kafka Topic 재발행
  for (const ruleHitEvent of ruleHitEvents) {
    console.log(
      `[analyzer] rule hit. ruleId=${ruleHitEvent.metadata.ruleId} severity=${ruleHitEvent.severity} eventId=${ruleHitEvent.eventId}`,
      ruleHitEvent,
    );

    await publishSecurityEvent(ruleHitEvent);
  }
};

/**
 * Storage, Event Pipeline, HTTP 서버 실행
 */
const startApplication = async (): Promise<void> => {
  // PostgreSQL 연결과 필수 테이블 확인
  await connectStorage();

  // Kafka Producer와 Consumer 초기화
  await startEventPipeline(handleSecurityEvent);

  /**
   * HTTP 서버 시작 오류 처리
   */
  server.on('error', (error) => {
    console.error(
      '[server] failed to start:',
      error,
    );

    process.exit(1);
  });

  // HTTP와 WebSocket 서버 실행
  server.listen(
    serverConfig.port,
    '0.0.0.0',
    () => {
      console.log(
        `[server] ${serverConfig.serviceName} listening on port ${serverConfig.port}`,
      );

      console.log(
        '[websocket] server listening on path /ws',
      );

      // 서버 시작 이후 Mock 이벤트 생성
      startMockEventGenerator(
        mockEventConfig.intervalMs,
        publishSecurityEvent,
      );
    },
  );
};

// 애플리케이션 초기화 실패 처리
void startApplication().catch((error) => {
  console.error(
    '[application] failed to start:',
    error,
  );

  process.exit(1);
});