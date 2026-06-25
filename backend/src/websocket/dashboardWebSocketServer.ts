import type { Server } from 'node:http';

import {
  WebSocket,
  WebSocketServer,
} from 'ws';

import type { SecurityEvent } from '../events/index.js';

/**
 * Dashboard 전달 SecurityEvent 메시지
 */
interface SecurityEventMessage {
  type: 'SECURITY_EVENT';
  payload: SecurityEvent;
}

/**
 * Dashboard WebSocket 서버 외부 인터페이스
 */
export interface DashboardWebSocketServer {
  broadcastSecurityEvent: (
    event: SecurityEvent,
  ) => void;
}

/**
 * 기존 HTTP 서버 기반 Dashboard WebSocket 생성
 */
export const createDashboardWebSocketServer = (
  server: Server,
): DashboardWebSocketServer => {
  const webSocketServer = new WebSocketServer({
    server,
    path: '/ws',
  });

  /**
   * Dashboard Client 연결 처리
   */
  webSocketServer.on(
    'connection',
    (socket) => {
      console.log( `[websocket] client connected. clients=${webSocketServer.clients.size}` );

      /**
       * Client Socket 오류 처리
       */
      socket.on('error', (error) => {
        console.error( '[websocket] client error:', error);
      });

      /**
       * Client 연결 종료 처리
       */
      socket.on('close', () => {
        console.log( `[websocket] client disconnected. clients=${webSocketServer.clients.size}` );
      });
    },
  );

  /**
   * WebSocket 서버 오류 처리
   */
  webSocketServer.on('error', (error) => {
    console.error( '[websocket] server error:', error );
  });

  return {
    /**
     * 연결된 Dashboard Client 대상 SecurityEvent 전달
     */
    broadcastSecurityEvent: (
      event: SecurityEvent,
    ): void => {
      const message: SecurityEventMessage = {
        type: 'SECURITY_EVENT',
        payload: event,
      };

      const serializedMessage = JSON.stringify(message);

      let recipientCount = 0;

      for (const client of webSocketServer.clients) {
        // 메시지 전송 가능한 Client 확인
        if (client.readyState !== WebSocket.OPEN) {
          continue;
        }

        recipientCount += 1;

        /**
         * Client별 메시지 전송 오류 처리
         */
        client.send(
          serializedMessage,
          (error) => {
            if (error === undefined) {
              return;
            }

            console.error( `[websocket] send failed. eventType=${event.eventType} eventId=${event.eventId}`, error );
          },
        );
      }

      console.log( `[websocket] broadcast. eventType=${event.eventType} eventId=${event.eventId} clients=${recipientCount}` );
    },
  };
};