import express from 'express';

import { RuleBasedAnalyzer } from './analyzer/ruleBasedAnalyzer.js';
import { analyzerConfig } from './config/analyzerConfig.js';
import { mockEventConfig } from './config/mockEventConfig.js';
import { serverConfig } from './config/serverConfig.js';
import type { SecurityEvent } from './events/index.js';
import { startMockEventGenerator } from './mock/mockEventGenerator.js';
import {
  publishSecurityEvent,
  startEventPipeline,
} from './pipeline/eventPipeline.js';
import { securityEventRouter } from './routes/securityEventRoutes.js';
import { connectStorage } from './storage/postgres.js';
import { saveSecurityEvent } from './storage/securityEventRepository.js';

const app = express();

/**
 * Rule 기반 SecurityEvent Analyzer
 */
const ruleBasedAnalyzer = new RuleBasedAnalyzer(
  analyzerConfig,
);

// 서버 구현 기술 응답 헤더 노출 비활성화
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

/**
 * Consumer 수신 이벤트 저장, 분석, Rule Hit 재발행
 */
const handleSecurityEvent = async (
  event: SecurityEvent,
): Promise<void> => {
  // 원본 SecurityEvent 또는 RULE_HIT 저장
  const inserted = await saveSecurityEvent(event);

  // 신규 저장 또는 중복 저장 생략 결과 출력
  console.log(
    inserted
      ? `[storage] saved. eventType=${event.eventType} eventId=${event.eventId}`
      : `[storage] duplicate skipped. eventType=${event.eventType} eventId=${event.eventId}`,
  );

  // 저장 중복 여부와 관계없는 Analyzer 처리 유지
  const ruleHitEvents =
    ruleBasedAnalyzer.analyze(event);

  // 탐지된 Rule Hit의 기존 Kafka Topic 재발행
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

  // Kafka Producer, Consumer 및 Handler 구성
  await startEventPipeline(handleSecurityEvent);

  // 모든 네트워크 Interface 대상 HTTP 서버 실행
  const server = app.listen(
    serverConfig.port,
    '0.0.0.0',
  );

  /**
   * HTTP 서버 실행 완료 처리
   */
  server.once('listening', () => {
    console.log(
      `[server] ${serverConfig.serviceName} listening on port ${serverConfig.port}`,
    );

    // HTTP 서버 실행 이후 Mock 이벤트 생성 시작
    startMockEventGenerator(
      mockEventConfig.intervalMs,
      publishSecurityEvent,
    );
  });

  /**
   * HTTP 서버 실행 실패 처리
   */
  server.once('error', (error) => {
    console.error(
      '[server] failed to start:',
      error,
    );

    process.exit(1);
  });
};

// 애플리케이션 초기화 실패 처리
void startApplication().catch((error) => {
  console.error(
    '[application] failed to start:',
    error,
  );

  process.exit(1);
});