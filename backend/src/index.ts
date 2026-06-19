import express from 'express';

import { serverConfig } from './config/serverConfig.js';

const app = express();

// 서버 구현 기술이 응답 헤더에 노출되지 않도록 비활성화
app.disable('x-powered-by');

/**
 * 애플리케이션 실행 상태를 확인하는 Health Check API
 */
app.get('/health', (_request, response) => {
  response.status(200).json({
    status: 'ok',
    service: serverConfig.serviceName,
  });
});

// Docker 컨테이너 외부에서도 접근할 수 있도록 모든 네트워크 인터페이스에 바인딩
const server = app.listen(serverConfig.port, '0.0.0.0', () => {
  console.log(
    `[server] ${serverConfig.serviceName} listening on http://localhost:${serverConfig.port}`,
  );
});

// 포트 충돌 등 서버 시작 과정에서 발생한 오류를 실패 상태로 처리
server.on('error', (error) => {
  console.error('[server] failed to start:', error);
  process.exit(1);
});