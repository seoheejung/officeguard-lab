import type { RequestHandler } from 'express';

import { privacyProtector } from '../privacy/privacyProtector.js';

/**
 * 이벤트 조회 API 요청 정보와 처리 결과 기록
 */
export const securityEventAccessLogger: RequestHandler = (
  request,
  response,
  next,
) => {
  // 요청 시각과 처리 시간 측정 시작값 기록
  const requestedAt = new Date().toISOString();
  const startedAt = performance.now();

  // Query String을 제외한 API 요청 경로 구성
  const requestPath = `${request.baseUrl}${request.path}`;

  // Express 또는 Socket에서 Client IP 조회
  const rawClientIp = request.ip ?? request.socket.remoteAddress;

  // 확인 가능한 Client IP만 보호 처리
  const clientIp =
    rawClientIp === undefined
      ? 'unknown'
      : privacyProtector.protectSourceIp(rawClientIp);

  // 응답 전송 완료 후 상태 코드와 처리 시간 기록
  response.once('finish', () => {
    const durationMs = Math.round(performance.now() - startedAt);

    console.log( `[event-query-access] requestedAt=${requestedAt} method=${request.method} path=${requestPath} status=${response.statusCode} durationMs=${durationMs} clientIp=${clientIp}` );
  });

  // 다음 Middleware 또는 Route Handler 실행
  next();
};