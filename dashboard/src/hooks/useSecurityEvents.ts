import { useEffect, useState } from 'react';

import type {
  DashboardSecurityEvent,
  SecurityEventListResponse,
  SecurityEventMessage,
} from '../types/securityEvent';

// Dashboard 상태별 최대 보관 이벤트 수
const EVENT_LIMIT = 50;

export type WebSocketStatus =
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'ERROR';

export interface SecurityEventState {
  events: DashboardSecurityEvent[];
  dnsEvents: DashboardSecurityEvent[];
  ruleHits: DashboardSecurityEvent[];
  webSocketStatus: WebSocketStatus;
  loadError?: string;
}

/**
 * eventId 기준 이벤트 병합
 */
const mergeEvents = (
  currentEvents: readonly DashboardSecurityEvent[],
  incomingEvents: readonly DashboardSecurityEvent[],
): DashboardSecurityEvent[] => {
  // 기존 이벤트 기준 Map 생성
  const eventsById = new Map(
    currentEvents.map((event) => [
      event.eventId,
      event,
    ]),
  );

  // 신규 이벤트 추가 또는 동일 eventId 갱신
  for (const event of incomingEvents) {
    eventsById.set(event.eventId, event);
  }

  // 발생 시각 내림차순 정렬 및 최근 이벤트 제한
  return [...eventsById.values()]
    .sort(
      (first, second) =>
        Date.parse(second.timestamp) -
        Date.parse(first.timestamp),
    )
    .slice(0, EVENT_LIMIT);
};

/**
 * 이벤트 목록 조회
 */
const fetchEventList = async (
  path: string,
): Promise<SecurityEventListResponse> => {
  const response = await fetch(path, {
    headers: {
      Accept: 'application/json',
    },
  });

  // HTTP 오류 응답 처리
  if (!response.ok) {
    throw new Error(
      `[dashboard-api] request failed. status=${response.status} path=${path}`,
    );
  }

  return response.json() as Promise<SecurityEventListResponse>;
};

/**
 * 현재 Origin 기반 WebSocket URL 생성
 */
const createWebSocketUrl = (): string => {
  // HTTPS 환경의 WSS Protocol 적용
  const protocol =
    window.location.protocol === 'https:'
      ? 'wss:'
      : 'ws:';

  return `${protocol}//${window.location.host}/ws`;
};

/**
 * WebSocket 메시지 검증
 */
const isSecurityEventMessage = (
  value: unknown,
): value is SecurityEventMessage => {
  // WebSocket 메시지 객체 여부 확인
  if (
    typeof value !== 'object' ||
    value === null
  ) {
    return false;
  }

  const message =
    value as Partial<SecurityEventMessage>;

  const payload = message.payload;

  // SecurityEvent 필수 필드 확인
  return (
    message.type === 'SECURITY_EVENT' &&
    typeof payload === 'object' &&
    payload !== null &&
    typeof payload.eventId === 'string' &&
    typeof payload.eventType === 'string' &&
    typeof payload.timestamp === 'string' &&
    typeof payload.message === 'string'
  );
};

/**
 * 최근 이벤트와 WebSocket 상태 관리
 */
export const useSecurityEvents =
  (): SecurityEventState => {
    // 전체 이벤트 타임라인 상태
    const [
      events,
      setEvents,
    ] = useState<DashboardSecurityEvent[]>([]);

    // DNS Query 통계 대상 상태
    const [
      dnsEvents,
      setDnsEvents,
    ] = useState<DashboardSecurityEvent[]>([]);

    // Rule Hit 목록 상태
    const [
      ruleHits,
      setRuleHits,
    ] = useState<DashboardSecurityEvent[]>([]);

    // WebSocket 연결 상태
    const [
      webSocketStatus,
      setWebSocketStatus,
    ] = useState<WebSocketStatus>('CONNECTING');

    // 초기 API 조회 오류 상태
    const [
      loadError,
      setLoadError,
    ] = useState<string>();

    useEffect(() => {
      // Component 활성 상태
      let active = true;

      /**
       * 수신 이벤트 상태 반영
       */
      const addEvent = (
        event: DashboardSecurityEvent,
      ): void => {
        // 전체 이벤트 타임라인 반영
        setEvents((currentEvents) =>
          mergeEvents(
            currentEvents,
            [event],
          ),
        );

        // DNS Query 통계 상태 반영
        if (event.eventType === 'DNS_QUERY') {
          setDnsEvents((currentEvents) =>
            mergeEvents(
              currentEvents,
              [event],
            ),
          );
        }

        // Rule Hit 목록 상태 반영
        if (event.eventType === 'RULE_HIT') {
          setRuleHits((currentEvents) =>
            mergeEvents(
              currentEvents,
              [event],
            ),
          );
        }
      };

      /**
       * 최근 이벤트 초기 조회
       */
      const loadInitialEvents =
        async (): Promise<void> => {
          try {
            // 초기 Dashboard 데이터 병렬 조회
            const [
              eventResponse,
              dnsResponse,
              ruleHitResponse,
            ] = await Promise.all([
              fetchEventList(
                `/api/events?limit=${EVENT_LIMIT}`,
              ),
              fetchEventList(
                `/api/events?eventType=DNS_QUERY&limit=${EVENT_LIMIT}`,
              ),
              fetchEventList(
                `/api/rule-hits?limit=${EVENT_LIMIT}`,
              ),
            ]);

            // Component 종료 이후 상태 변경 방지
            if (!active) {
              return;
            }

            // 전체 이벤트 초기 상태 병합
            setEvents((currentEvents) =>
              mergeEvents(
                currentEvents,
                eventResponse.items,
              ),
            );

            // DNS Query 초기 상태 병합
            setDnsEvents((currentEvents) =>
              mergeEvents(
                currentEvents,
                dnsResponse.items,
              ),
            );

            // Rule Hit 초기 상태 병합
            setRuleHits((currentEvents) =>
              mergeEvents(
                currentEvents,
                ruleHitResponse.items,
              ),
            );
          } catch (error) {
            // Component 종료 이후 오류 상태 변경 방지
            if (!active) {
              return;
            }

            setLoadError(
              error instanceof Error
                ? error.message
                : 'Dashboard initial request failed',
            );
          }
        };

      // Dashboard WebSocket 연결
      const socket = new WebSocket(
        createWebSocketUrl(),
      );

      /**
       * WebSocket 연결 완료 처리
       */
      socket.addEventListener('open', () => {
        if (active) {
          setWebSocketStatus('CONNECTED');
        }
      });

      /**
       * WebSocket SecurityEvent 수신 처리
       */
      socket.addEventListener(
        'message',
        (messageEvent) => {
          // 비활성 Component 및 문자열 외 메시지 제외
          if (
            !active ||
            typeof messageEvent.data !== 'string'
          ) {
            return;
          }

          try {
            // WebSocket JSON 메시지 변환
            const message: unknown = JSON.parse(
              messageEvent.data,
            );

            // 검증 완료 SecurityEvent 상태 반영
            if (
              isSecurityEventMessage(message)
            ) {
              addEvent(message.payload);
            }
          } catch {
            // 잘못된 WebSocket 메시지 무시
          }
        },
      );

      /**
       * WebSocket 연결 오류 처리
       */
      socket.addEventListener('error', () => {
        if (active) {
          setWebSocketStatus('ERROR');
        }
      });

      /**
       * WebSocket 연결 종료 처리
       */
      socket.addEventListener('close', () => {
        if (!active) {
          return;
        }

        // 오류 상태 유지 또는 일반 종료 상태 적용
        setWebSocketStatus(
          (currentStatus) =>
            currentStatus === 'ERROR'
              ? 'ERROR'
              : 'DISCONNECTED',
        );
      });

      // PostgreSQL 최근 이벤트 초기 조회
      void loadInitialEvents();

      /**
       * Component 종료 시 WebSocket 정리
       */
      return () => {
        active = false;
        socket.close();
      };
    }, []);

    return {
      events,
      dnsEvents,
      ruleHits,
      webSocketStatus,
      loadError,
    };
  };