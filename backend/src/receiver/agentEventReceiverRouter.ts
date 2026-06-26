import { Router } from 'express';

import type {
  DnsQueryEvent,
} from '../events/index.js';
import {
  publishSecurityEvent,
} from '../pipeline/eventPipeline.js';
import {
  DnsQueryEventValidationError,
  parseDnsQueryEvent,
} from './dnsQueryEventValidator.js';

// Mini PC Agent Event Receiver Router 생성
export const agentEventReceiverRouter =
  Router();

/**
 * Mini PC Agent DNS_QUERY 수신
 */
agentEventReceiverRouter.post(
  '/events',
  async (request, response) => {
    // 검증 완료 DNS_QUERY 이벤트 저장 변수
    let event: DnsQueryEvent;

    try {
      // 외부 요청 Body의 unknown 타입 처리
      const requestBody: unknown = request.body;

      // DNS_QUERY 구조 검증 및 이벤트 재구성
      event = parseDnsQueryEvent( requestBody );
    } catch (error) {
      // 예상 가능한 수신 데이터 검증 오류 처리
      if ( error instanceof DnsQueryEventValidationError ) {
        // 검증 실패 원인 로그 출력
        console.error( `[event-receiver] invalid DNS_QUERY. reason=${error.message}` );

        // 잘못된 DNS_QUERY 응답 반환
        response.status(400).json({
          error: 'invalid_dns_query',
          message: error.message,
        });

        return;
      }

      // 예상하지 못한 검증 오류 로그 출력
      console.error( '[event-receiver] validation failed:', error );

      // 일반 검증 실패 응답 반환
      response.status(400).json({
        error: 'invalid_dns_query',
      });

      return;
    }

    try {
      // 검증 완료 이벤트의 기존 Event Pipeline 발행
      await publishSecurityEvent(event);

      // Event Receiver 수신 및 발행 완료 로그 출력
      console.log( `[event-receiver] accepted. eventType=${event.eventType} eventId=${event.eventId} sourceIp=${event.sourceIp}` );

      // 비동기 처리 접수 완료 응답 반환
      response.status(202).json({
        status: 'accepted',
        eventId: event.eventId,
      });
    } catch (error) {
      // Kafka Event Pipeline 발행 실패 로그 출력
      console.error( `[event-receiver] publish failed. eventType=${event.eventType} eventId=${event.eventId}`, error );

      // 이벤트 발행 실패 응답 반환
      response.status(500).json({
        error: 'event_publish_failed',
      });
    }
  },
);