import express from 'express';

import { mockEventConfig } from './config/mockEventConfig.js';
import { serverConfig } from './config/serverConfig.js';
import { startMockEventGenerator } from './mock/mockEventGenerator.js';
import {
  publishSecurityEvent,
  startEventPipeline,
} from './pipeline/eventPipeline.js';

const app = express();

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
 * Event Pipeline과 HTTP 서버 실행
 */
const startApplication = async (): Promise<void> => {
  await startEventPipeline();

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

  // 포트 충돌 등 HTTP 서버 시작 오류 처리
  server.on('error', (error) => {
    console.error('[server] failed to start:', error);
    process.exit(1);
  });
};

void startApplication().catch((error) => {
  console.error('[application] failed to start:', error);
  process.exit(1);
});