import { createServer } from 'node:http';

import express from 'express';

import { RuleBasedAnalyzer } from './analyzer/ruleBasedAnalyzer.js';
import { analyzerConfig } from './config/analyzerConfig.js';
import { privacyConfig } from './config/privacyConfig.js';
import { serverConfig } from './config/serverConfig.js';
import type { SecurityEvent } from './events/index.js';
import {
  publishSecurityEvent,
  startEventPipeline,
} from './pipeline/eventPipeline.js';
import { privacyProtector } from './privacy/privacyProtector.js';
import { agentEventReceiverRouter } from './receiver/agentEventReceiverRouter.js';
import { securityEventRouter } from './routes/securityEventRoutes.js';
import {
  runEventRetentionCleanup,
  startEventRetentionCleanup,
} from './storage/eventRetentionCleanup.js';
import { connectStorage } from './storage/postgres.js';
import { saveSecurityEvent } from './storage/securityEventRepository.js';
import { createDashboardWebSocketServer } from './websocket/dashboardWebSocketServer.js';

const app = express();

/**
 * Rule 기반 SecurityEvent Analyzer
 */
const ruleBasedAnalyzer = new RuleBasedAnalyzer(analyzerConfig);

// 서버 구현 기술 응답 헤더 노출 비활성화
app.disable('x-powered-by');

// Agent Event Receiver JSON Body 처리
app.use(express.json());

/**
 * 애플리케이션 실행 상태 확인 API
 */
app.get('/health', (_request, response) => {
  response.status(200).json({
    status: 'ok',
    service: serverConfig.serviceName,
  });
});

// Mini PC Agent Event Receiver 연결
app.use('/api/agent', agentEventReceiverRouter);

// Storage 조회 API 연결
app.use('/api', securityEventRouter);

// Express 기반 HTTP 서버 생성
const server = createServer(app);

// 동일 HTTP 서버 기반 WebSocket 구성
const dashboardWebSocketServer =
  createDashboardWebSocketServer(server);

/**
 * Consumer 수신 이벤트 보호, 저장, 전달, 분석
 */
const handleSecurityEvent = async (
  event: SecurityEvent,
): Promise<void> => {
  // PostgreSQL 저장 및 Dashboard 표시용 보호 이벤트 생성
  const protectedEvent =
    privacyProtector.protectSecurityEvent(event);

  // 보호 이벤트 PostgreSQL 저장
  const inserted = await saveSecurityEvent(protectedEvent);

  console.log(
    inserted
      ? `[storage] saved. eventType=${protectedEvent.eventType} eventId=${protectedEvent.eventId}`
      : `[storage] duplicate skipped. eventType=${protectedEvent.eventType} eventId=${protectedEvent.eventId}`,
  );

  // 신규 저장 보호 이벤트 Dashboard 전달
  if (inserted) {
    dashboardWebSocketServer.broadcastSecurityEvent(
      protectedEvent,
    );
  }

  // 마스킹 전 원본 이벤트 Analyzer 평가
  const ruleHitEvents = ruleBasedAnalyzer.analyze(event);

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
 * Storage, 보관 정책, Event Pipeline, HTTP 서버 실행
 */
const startApplication = async (): Promise<void> => {
  // PostgreSQL 연결과 필수 테이블 확인
  await connectStorage();

  // Backend 시작 시 보관 기간 초과 이벤트 즉시 정리
  await runEventRetentionCleanup(
    privacyConfig.eventRetentionDays,
  );

  // 설정된 주기에 따른 만료 이벤트 반복 정리
  startEventRetentionCleanup(
    privacyConfig.eventRetentionDays,
    privacyConfig.retentionCleanupIntervalMs,
  );

  // Kafka Producer와 Consumer 초기화
  await startEventPipeline(handleSecurityEvent);

  // HTTP 서버 시작 오류 처리
  server.on('error', (error) => {
    console.error('[server] failed to start:', error);
    process.exit(1);
  });

  // HTTP와 WebSocket 서버 실행
  server.listen(serverConfig.port, '0.0.0.0', () => {
    console.log( `[server] ${serverConfig.serviceName} listening on port ${serverConfig.port}` );
    console.log( '[websocket] server listening on path /ws' );
  });
};

// 애플리케이션 초기화 실패 처리
void startApplication().catch((error: unknown) => {
  console.error('[application] failed to start:', error);
  process.exit(1);
});