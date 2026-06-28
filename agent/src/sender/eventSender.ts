import type { DnsQueryEvent } from '../events/dnsQueryEvent.js';
import type { EndpointEvent } from '../events/endpointEvent.js';
import type { NetworkFlowEvent } from '../events/networkFlowEvent.js';

export type AgentSecurityEvent =
  | DnsQueryEvent
  | NetworkFlowEvent
  | EndpointEvent;

interface EventSenderConfig {
  receiverUrl: string;
  requestTimeoutMs: number;
}

/**
 * 일반 JSON 객체 여부 확인
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * SecurityEvent Event Receiver 전송
 */
export const sendSecurityEvent = async (
  event: AgentSecurityEvent,
  config: EventSenderConfig,
): Promise<void> => {
  const response = await fetch(config.receiverUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });

  if (!response.ok) {
    const responseBody = await response.text();

    throw new Error( `[event-sender] receiver rejected event. status=${response.status} body=${responseBody}` );
  }

  const responseBody: unknown = await response.json();

  if (!isRecord(responseBody)) {
    throw new Error( '[event-sender] receiver response must be an object' );
  }

  if (
    responseBody.status !== 'accepted' ||
    responseBody.eventId !== event.eventId
  ) {
    throw new Error( '[event-sender] receiver response is invalid' );
  }
};