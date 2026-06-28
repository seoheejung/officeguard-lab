import { Router } from 'express';

import type {
  DnsQueryEvent,
  EndpointEvent,
  NetworkFlowEvent,
} from '../events/index.js';
import { publishSecurityEvent } from '../pipeline/eventPipeline.js';
import {
  DnsQueryEventValidationError,
  parseDnsQueryEvent,
} from './dnsQueryEventValidator.js';
import {
  EndpointEventValidationError,
  parseEndpointEvent,
} from './endpointEventValidator.js';
import {
  NetworkFlowEventValidationError,
  parseNetworkFlowEvent,
} from './networkFlowEventValidator.js';

/**
 * Mini PC Agent 수신 가능 이벤트
 */
type AgentSecurityEvent = | DnsQueryEvent | NetworkFlowEvent | EndpointEvent;

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
 * 일반 JSON 객체 여부 확인
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Endpoint Event 타입 식별
 */
const isEndpointEventType = (
  value: unknown,
): value is EndpointEvent['eventType'] =>
  value === 'PROCESS_START' ||
  value === 'FILE_CREATED' ||
  value === 'FILE_MODIFIED' ||
  value === 'FILE_DELETED' ||
  value === 'FILE_COPIED' ||
  value === 'USB_CONNECTED' ||
  value === 'USB_DISCONNECTED' ||
  value === 'PRINT_REQUESTED';

/**
 * Agent SecurityEvent 타입별 검증 및 재구성
 */
const parseAgentEvent = (value: unknown): AgentSecurityEvent => {
  if (!isRecord(value)) {
    throw new AgentEventValidationError( 'request body must be a JSON object' );
  }

  switch (value.eventType) {
    case 'DNS_QUERY':
      return parseDnsQueryEvent(value);

    case 'NETWORK_FLOW':
      return parseNetworkFlowEvent(value);

    default:
      if (isEndpointEventType(value.eventType)) {
        return parseEndpointEvent(value);
      }

      throw new AgentEventValidationError( 'unsupported Agent SecurityEvent type' );
  }
};

/**
 * 검증 오류 유형별 응답 코드 결정
 */
const getValidationErrorCode = (error: Error): string => {
  if (error instanceof DnsQueryEventValidationError) {
    return 'invalid_dns_query';
  }

  if (error instanceof NetworkFlowEventValidationError) {
    return 'invalid_network_flow';
  }

  if (error instanceof EndpointEventValidationError) {
    return 'invalid_endpoint_event';
  }

  return 'invalid_agent_event';
};

/**
 * 처리 가능한 검증 오류 여부 확인
 */
const isAgentEventValidationError = (error: unknown): error is Error =>
  error instanceof AgentEventValidationError ||
  error instanceof DnsQueryEventValidationError ||
  error instanceof NetworkFlowEventValidationError ||
  error instanceof EndpointEventValidationError;

// Mini PC Agent Event Receiver Router 생성
export const agentEventReceiverRouter = Router();

/**
 * Mini PC Agent SecurityEvent 수신
 */
agentEventReceiverRouter.post('/events', async (request, response) => {
  let event: AgentSecurityEvent;

  try {
    // 외부 요청 Body의 unknown 타입 유지
    const requestBody: unknown = request.body;

    // 이벤트 타입별 구조 검증
    event = parseAgentEvent(requestBody);
  } catch (error) {
    if (isAgentEventValidationError(error)) {
      const errorCode = getValidationErrorCode(error);

      console.error( `[event-receiver] invalid event. reason=${error.message}` );

      response.status(400).json({
        error: errorCode,
        message: error.message,
      });

      return;
    }

    // 예상하지 못한 검증 처리 오류 기록
    console.error('[event-receiver] validation failed:', error);

    response.status(400).json({
      error: 'invalid_agent_event',
    });

    return;
  }

  try {
    // 검증 완료 이벤트의 기존 Pipeline 발행
    await publishSecurityEvent(event);

    console.log( `[event-receiver] accepted. eventType=${event.eventType} eventId=${event.eventId} sourceIp=${event.sourceIp ?? 'unknown'}` );

    // Agent 전송 성공 확인용 eventId 반환
    response.status(202).json({
      status: 'accepted',
      eventId: event.eventId,
    });
  } catch (error) {
    // Kafka 발행 실패 기록
    console.error( `[event-receiver] publish failed. eventType=${event.eventType} eventId=${event.eventId}`, error );

    response.status(500).json({
      error: 'event_publish_failed',
    });
  }
});