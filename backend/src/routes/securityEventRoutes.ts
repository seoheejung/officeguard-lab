import { Router } from 'express';
import type { Response } from 'express';

import type {
  SecurityEventType,
  SecuritySeverity,
} from '../events/index.js';
import {
  findSecurityEventById,
  findSecurityEvents,
} from '../storage/securityEventRepository.js';
import type { SecurityEventQuery } from '../storage/securityEventRepository.js';

/**
 * 목록 조회 개수 제한
 */
const DEFAULT_QUERY_LIMIT = 50;
const MAX_QUERY_LIMIT = 100;

/**
 * Query Parameter에서 허용하는 이벤트 타입
 */
const securityEventTypes = new Set<string>([
  'DNS_QUERY',
  'NETWORK_FLOW',
  'PROCESS_START',
  'FILE_CREATED',
  'FILE_MODIFIED',
  'FILE_DELETED',
  'FILE_COPIED',
  'USB_CONNECTED',
  'USB_DISCONNECTED',
  'PRINT_REQUESTED',
  'EMAIL_ATTACHMENT_SENT',
  'RULE_HIT',
]);

/**
 * Query Parameter에서 허용하는 Severity
 */
const securitySeverities = new Set<string>([
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
]);

/**
 * Query Parameter 검증 오류
 */
class QueryValidationError extends Error {}

/**
 * Storage 조회 API Router
 */
export const securityEventRouter = Router();

/**
 * 단일 Query Parameter 조회
 */
const getOptionalQueryValue = (
  value: unknown,
  name: string,
): string | undefined => {
  // 미전달 Query Parameter 제외
  if (value === undefined) {
    return undefined;
  }

  // 배열 등 복수 Query Parameter 차단
  if (typeof value !== 'string') {
    throw new QueryValidationError(
      `${name} must be a single string value`,
    );
  }

  // 앞뒤 공백 제거
  const trimmedValue = value.trim();

  // 빈 문자열 Query Parameter 차단
  if (trimmedValue === '') {
    throw new QueryValidationError(
      `${name} must not be empty`,
    );
  }

  return trimmedValue;
};

/**
 * 조회 개수 변환
 */
const parseLimit = (value: unknown): number => {
  // Query Parameter 미전달 시 기본 조회 개수 적용
  if (value === undefined) {
    return DEFAULT_QUERY_LIMIT;
  }

  const rawValue = getOptionalQueryValue(
    value,
    'limit',
  );

  // 문자열 Query Parameter의 숫자 변환
  const limit = Number(rawValue);

  // 정수 범위 검증
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_QUERY_LIMIT
  ) {
    throw new QueryValidationError(
      `limit must be an integer between 1 and ${MAX_QUERY_LIMIT}`,
    );
  }

  return limit;
};

/**
 * 이벤트 타입 검증
 */
const parseEventType = (
  value: unknown,
): SecurityEventType | undefined => {
  const eventType = getOptionalQueryValue(
    value,
    'eventType',
  );

  if (eventType === undefined) {
    return undefined;
  }

  // 지원하지 않는 이벤트 타입 차단
  if (!securityEventTypes.has(eventType)) {
    throw new QueryValidationError(
      `unsupported eventType: ${eventType}`,
    );
  }

  return eventType as SecurityEventType;
};

/**
 * Severity 검증
 */
const parseSeverity = (
  value: unknown,
): SecuritySeverity | undefined => {
  const severity = getOptionalQueryValue(
    value,
    'severity',
  );

  if (severity === undefined) {
    return undefined;
  }

  // 지원하지 않는 Severity 차단
  if (!securitySeverities.has(severity)) {
    throw new QueryValidationError(
      `unsupported severity: ${severity}`,
    );
  }

  return severity as SecuritySeverity;
};

/**
 * 조회 시각 검증
 */
const parseTimestamp = (
  value: unknown,
  name: string,
): string | undefined => {
  const timestamp = getOptionalQueryValue(
    value,
    name,
  );

  if (timestamp === undefined) {
    return undefined;
  }

  // Timestamp 문자열의 유효 시각 변환
  const timestampMs = Date.parse(timestamp);

  if (Number.isNaN(timestampMs)) {
    throw new QueryValidationError(
      `${name} must be a valid timestamp`,
    );
  }

  // PostgreSQL 조회용 UTC ISO 8601 형식 변환
  return new Date(timestampMs).toISOString();
};

/**
 * 조회 시간 범위 검증
 */
const validateTimeRange = (
  from: string | undefined,
  to: string | undefined,
): void => {
  // 시작 또는 종료 시각 단독 조회 허용
  if (from === undefined || to === undefined) {
    return;
  }

  // 역전된 조회 시간 범위 차단
  if (Date.parse(from) > Date.parse(to)) {
    throw new QueryValidationError(
      'from must be earlier than or equal to to',
    );
  }
};

/**
 * Storage 조회 API 오류 응답
 */
const sendQueryError = (
  response: Response,
  error: unknown,
): void => {
  // Query Parameter 검증 오류 응답
  if (error instanceof QueryValidationError) {
    response.status(400).json({
      error: 'invalid_query',
      message: error.message,
    });
    return;
  }

  // 내부 Storage 조회 오류 기록
  console.error('[storage-api] query failed:', error);

  // 내부 오류 상세 정보 비노출
  response.status(500).json({
    error: 'storage_query_failed',
  });
};

/**
 * SecurityEvent 목록 조회
 */
securityEventRouter.get(
  '/events',
  async (request, response) => {
    try {
      // 시간 범위 Query Parameter 변환
      const from = parseTimestamp(
        request.query.from,
        'from',
      );

      const to = parseTimestamp(
        request.query.to,
        'to',
      );

      // 시작 시각과 종료 시각 순서 검증
      validateTimeRange(from, to);

      // 필수 조회 조건 생성
      const query: SecurityEventQuery = {
        limit: parseLimit(request.query.limit),
      };

      // 선택 조회 조건 변환
      const eventType = parseEventType(
        request.query.eventType,
      );

      const sourceIp = getOptionalQueryValue(
        request.query.sourceIp,
        'sourceIp',
      );

      const deviceId = getOptionalQueryValue(
        request.query.deviceId,
        'deviceId',
      );

      // 전달된 조회 조건만 Repository에 전달
      if (eventType !== undefined) {
        query.eventType = eventType;
      }

      if (sourceIp !== undefined) {
        query.sourceIp = sourceIp;
      }

      if (deviceId !== undefined) {
        query.deviceId = deviceId;
      }

      if (from !== undefined) {
        query.from = from;
      }

      if (to !== undefined) {
        query.to = to;
      }

      // 조건별 SecurityEvent 조회
      const items = await findSecurityEvents(query);

      response.status(200).json({
        count: items.length,
        items,
      });
    } catch (error) {
      sendQueryError(response, error);
    }
  },
);

/**
 * eventId 기준 SecurityEvent 조회
 */
securityEventRouter.get(
  '/events/:eventId',
  async (request, response) => {
    try {
      // Path Parameter 기준 이벤트 단건 조회
      const event = await findSecurityEventById(
        request.params.eventId,
      );

      // 조회 결과 미존재 응답
      if (event === undefined) {
        response.status(404).json({
          error: 'event_not_found',
        });
        return;
      }

      response.status(200).json(event);
    } catch (error) {
      sendQueryError(response, error);
    }
  },
);

/**
 * Rule Hit 목록 조회
 */
securityEventRouter.get(
  '/rule-hits',
  async (request, response) => {
    try {
      // 시간 범위 Query Parameter 변환
      const from = parseTimestamp(
        request.query.from,
        'from',
      );

      const to = parseTimestamp(
        request.query.to,
        'to',
      );

      // 시작 시각과 종료 시각 순서 검증
      validateTimeRange(from, to);

      // RULE_HIT 고정 조회 조건 생성
      const query: SecurityEventQuery = {
        limit: parseLimit(request.query.limit),
        eventType: 'RULE_HIT',
      };

      // Rule Hit 선택 조회 조건 변환
      const severity = parseSeverity(
        request.query.severity,
      );

      const ruleId = getOptionalQueryValue(
        request.query.ruleId,
        'ruleId',
      );

      const sourceIp = getOptionalQueryValue(
        request.query.sourceIp,
        'sourceIp',
      );

      const deviceId = getOptionalQueryValue(
        request.query.deviceId,
        'deviceId',
      );

      // 전달된 조회 조건만 Repository에 전달
      if (severity !== undefined) {
        query.severity = severity;
      }

      if (ruleId !== undefined) {
        query.ruleId = ruleId;
      }

      if (sourceIp !== undefined) {
        query.sourceIp = sourceIp;
      }

      if (deviceId !== undefined) {
        query.deviceId = deviceId;
      }

      if (from !== undefined) {
        query.from = from;
      }

      if (to !== undefined) {
        query.to = to;
      }

      // 공통 Repository를 통한 RULE_HIT 조회
      const items = await findSecurityEvents(query);

      response.status(200).json({
        count: items.length,
        items,
      });
    } catch (error) {
      sendQueryError(response, error);
    }
  },
);