import type { DnsQueryEvent } from '../events/dnsQueryEvent.js';

interface EventSenderConfig {
  receiverUrl: string;
  requestTimeoutMs: number;
}

/**
 * 일반 객체 여부 확인
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value);

/**
 * DNS_QUERY Event Receiver 전송
 */
export const sendDnsQueryEvent = async (
  event: DnsQueryEvent,
  config: EventSenderConfig,
): Promise<void> => {
  // DNS_QUERY JSON 전송
  const response = await fetch(config.receiverUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });

  // Event Receiver 오류 응답 처리
  if (!response.ok) {
    const responseBody = await response.text();

    throw new Error(
      `[event-sender] receiver rejected event. status=${response.status} body=${responseBody}`,
    );
  }

  // Event Receiver 응답 Body 조회
  const responseBody: unknown = await response.json();

  // 응답 객체 형식 검증
  if (!isRecord(responseBody)) {
    throw new Error('[event-sender] receiver response must be an object');
  }

  // 접수 상태와 eventId 일치 여부 검증
  if (
    responseBody.status !== 'accepted' ||
    responseBody.eventId !== event.eventId
  ) {
    throw new Error('[event-sender] receiver response is invalid');
  }
};