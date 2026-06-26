import { Router } from 'express';

import type { DnsQueryEvent, NetworkFlowEvent } from '../events/index.js';
import { publishSecurityEvent } from '../pipeline/eventPipeline.js';
import {
  DnsQueryEventValidationError,
  parseDnsQueryEvent,
} from './dnsQueryEventValidator.js';
import {
  NetworkFlowEventValidationError,
  parseNetworkFlowEvent,
} from './networkFlowEventValidator.js';

type AgentSecurityEvent = DnsQueryEvent | NetworkFlowEvent;

/**
 * Agent Event Receiver 공통 검증 오류
 */
class AgentEventValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AgentEventValidationError';
  }
}

/**
 * 일반 객체 여부 확인
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Agent SecurityEvent 타입별 검증
 */
const parseAgentEvent = (value: unknown): AgentSecurityEvent => {
  // 요청 Body 객체 형식 검증
  if (!isRecord(value)) {
    throw new AgentEventValidationError( 'request body must be a JSON object' );
  }

  // 이벤트 타입별 Validator 호출
  switch (value.eventType) {
    case 'DNS_QUERY':
      return parseDnsQueryEvent(value);

    case 'NETWORK_FLOW':
      return parseNetworkFlowEvent(value);

    default:
      throw new AgentEventValidationError( 'eventType must be DNS_QUERY or NETWORK_FLOW' );
  }
};

// Mini PC Agent Event Receiver Router 생성
export const agentEventReceiverRouter = Router();

/**
 * Mini PC Agent SecurityEvent 수신
 */
agentEventReceiverRouter.post('/events', async (request, response) => {
  let event: AgentSecurityEvent;

  try {
    // 외부 요청 Body의 unknown 타입 처리
    const requestBody: unknown = request.body;

    // 이벤트 타입별 구조 검증
    event = parseAgentEvent(requestBody);
  } catch (error) {
    let errorCode = 'invalid_agent_event';

    // DNS_QUERY 검증 오류 구분
    if (error instanceof DnsQueryEventValidationError) {
      errorCode = 'invalid_dns_query';
    }

    // NETWORK_FLOW 검증 오류 구분
    if (error instanceof NetworkFlowEventValidationError) {
      errorCode = 'invalid_network_flow';
    }

    // 예상 가능한 검증 오류 처리
    if (
      error instanceof AgentEventValidationError ||
      error instanceof DnsQueryEventValidationError ||
      error instanceof NetworkFlowEventValidationError
    ) {
      console.error( `[event-receiver] invalid event. reason=${error.message}` );

      response.status(400).json({
        error: errorCode,
        message: error.message,
      });

      return;
    }

    // 예상하지 못한 검증 오류 처리
    console.error('[event-receiver] validation failed:', error);

    response.status(400).json({
      error: 'invalid_agent_event',
    });

    return;
  }

  try {
    // 검증 완료 이벤트의 기존 Pipeline 발행
    await publishSecurityEvent(event);

    console.log( `[event-receiver] accepted. eventType=${event.eventType} eventId=${event.eventId} sourceIp=${event.sourceIp}` );

    // 비동기 처리 접수 완료 응답
    response.status(202).json({
      status: 'accepted',
      eventId: event.eventId,
    });
  } catch (error) {
    // Kafka 발행 실패 처리
    console.error( `[event-receiver] publish failed. eventType=${event.eventType} eventId=${event.eventId}`, error );

    response.status(500).json({
      error: 'event_publish_failed',
    });
  }
});