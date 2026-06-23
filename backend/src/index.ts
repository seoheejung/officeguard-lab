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

const app = express();

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

/**
 * Consumer 수신 이벤트 분석과 Rule Hit 재발행
 */
const handleSecurityEvent = async (
  event: SecurityEvent,
): Promise<void> => {
  const ruleHitEvents =
    ruleBasedAnalyzer.analyze(event);

  for (const ruleHitEvent of ruleHitEvents) {
    console.log(
      `[analyzer] rule hit. ruleId=${ruleHitEvent.metadata.ruleId} severity=${ruleHitEvent.severity} eventId=${ruleHitEvent.eventId}`,
      ruleHitEvent,
    );

    await publishSecurityEvent(ruleHitEvent);
  }
};

/**
 * Event Pipeline과 HTTP 서버 실행
 */
const startApplication = async (): Promise<void> => {
  await startEventPipeline(handleSecurityEvent);

  const server = app.listen(
    serverConfig.port,
    '0.0.0.0',
    () => {
      console.log(
        `[server] ${serverConfig.serviceName} listening on port ${serverConfig.port}`,
      );

      startMockEventGenerator(
        mockEventConfig.intervalMs,
        publishSecurityEvent,
      );
    },
  );

  // HTTP 서버 시작 오류 처리
  server.on('error', (error) => {
    console.error(
      '[server] failed to start:',
      error,
    );
    process.exit(1);
  });
};

void startApplication().catch((error) => {
  console.error(
    '[application] failed to start:',
    error,
  );
  process.exit(1);
});