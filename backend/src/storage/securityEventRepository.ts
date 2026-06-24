import type { QueryResultRow } from 'pg';

import type {
  SecurityEvent,
  SecurityEventType,
  SecuritySeverity,
} from '../events/index.js';
import { storagePool } from './postgres.js';

/**
 * Storage 조회 API 응답 이벤트
 */
export interface StoredSecurityEvent {
  eventId: string;
  eventType: SecurityEventType;
  timestamp: string;
  sourceIp?: string;
  deviceId?: string;
  userAlias?: string;
  severity?: SecuritySeverity;
  message: string;
  metadata: Record<string, unknown>;
  storedAt: string;
}

/**
 * SecurityEvent 목록 조회 조건
 */
export interface SecurityEventQuery {
  limit: number;
  eventType?: SecurityEventType;
  severity?: SecuritySeverity;
  ruleId?: string;
  sourceIp?: string;
  deviceId?: string;
  from?: string;
  to?: string;
}

/**
 * PostgreSQL SecurityEvent 조회 결과
 */
interface StoredSecurityEventRow extends QueryResultRow {
  event_id: string;
  event_type: SecurityEventType;
  occurred_at: Date;
  source_ip: string | null;
  device_id: string | null;
  user_alias: string | null;
  severity: SecuritySeverity | null;
  message: string;
  metadata: Record<string, unknown>;
  stored_at: Date;
}

/**
 * SecurityEvent 조회 공통 Column
 */
const SELECT_SECURITY_EVENT_COLUMNS = `
  SELECT
    event_id,
    event_type,
    occurred_at,
    source_ip,
    device_id,
    user_alias,
    severity,
    message,
    metadata,
    stored_at
  FROM security_events
`;

/**
 * Database Row의 조회 응답 구조 변환
 */
const mapStoredSecurityEvent = (
  row: StoredSecurityEventRow,
): StoredSecurityEvent => {
  // 필수 Column 기반 응답 객체 생성
  const event: StoredSecurityEvent = {
    eventId: row.event_id,
    eventType: row.event_type,
    timestamp: row.occurred_at.toISOString(),
    message: row.message,
    metadata: row.metadata,
    storedAt: row.stored_at.toISOString(),
  };

  // NULL이 아닌 선택 필드만 응답에 포함
  if (row.source_ip !== null) {
    event.sourceIp = row.source_ip;
  }

  if (row.device_id !== null) {
    event.deviceId = row.device_id;
  }

  if (row.user_alias !== null) {
    event.userAlias = row.user_alias;
  }

  if (row.severity !== null) {
    event.severity = row.severity;
  }

  return event;
};

/**
 * SecurityEvent 저장
 */
export const saveSecurityEvent = async (
  event: SecurityEvent,
): Promise<boolean> => {
  // eventId 충돌 시 중복 Row 저장 생략
  const result = await storagePool.query(
    `
      INSERT INTO security_events (
        event_id,
        event_type,
        occurred_at,
        source_ip,
        device_id,
        user_alias,
        severity,
        message,
        metadata
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9::jsonb
      )
      ON CONFLICT (event_id) DO NOTHING
    `,
    [
      event.eventId,
      event.eventType,
      event.timestamp,
      event.sourceIp ?? null,
      event.deviceId ?? null,
      event.userAlias ?? null,
      event.severity ?? null,
      event.message,
      JSON.stringify(event.metadata),
    ],
  );

  // 신규 Row 저장 여부 반환
  return result.rowCount === 1;
};

/**
 * 조건별 SecurityEvent 목록 조회
 */
export const findSecurityEvents = async (
  query: SecurityEventQuery,
): Promise<StoredSecurityEvent[]> => {
  // WHERE 절과 Parameter 값 분리
  const conditions: string[] = [];
  const values: Array<string | number> = [];

  /**
   * 조회 조건과 Parameter 순번 추가
   */
  const addCondition = (
    condition: string,
    value: string,
  ): void => {
    values.push(value);

    conditions.push(
      condition.replace('?', `$${values.length}`),
    );
  };

  // 전달된 조회 조건만 WHERE 절에 포함
  if (query.eventType !== undefined) {
    addCondition('event_type = ?', query.eventType);
  }

  if (query.severity !== undefined) {
    addCondition('severity = ?', query.severity);
  }

  if (query.ruleId !== undefined) {
    addCondition(
      `metadata ->> 'ruleId' = ?`,
      query.ruleId,
    );
  }

  if (query.sourceIp !== undefined) {
    addCondition('source_ip = ?', query.sourceIp);
  }

  if (query.deviceId !== undefined) {
    addCondition('device_id = ?', query.deviceId);
  }

  if (query.from !== undefined) {
    addCondition('occurred_at >= ?', query.from);
  }

  if (query.to !== undefined) {
    addCondition('occurred_at <= ?', query.to);
  }

  // 조회 조건 존재 여부에 따른 WHERE 절 생성
  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

  // 마지막 Parameter에 조회 개수 추가
  values.push(query.limit);

  const result =
    await storagePool.query<StoredSecurityEventRow>(
      `
        ${SELECT_SECURITY_EVENT_COLUMNS}
        ${whereClause}
        ORDER BY occurred_at DESC, event_id DESC
        LIMIT $${values.length}
      `,
      values,
    );

  // Database Row 목록의 API 응답 구조 변환
  return result.rows.map(mapStoredSecurityEvent);
};

/**
 * eventId 기준 SecurityEvent 조회
 */
export const findSecurityEventById = async (
  eventId: string,
): Promise<StoredSecurityEvent | undefined> => {
  const result =
    await storagePool.query<StoredSecurityEventRow>(
      `
        ${SELECT_SECURITY_EVENT_COLUMNS}
        WHERE event_id = $1
      `,
      [eventId],
    );

  // 조회된 첫 번째 Row 확인
  const row = result.rows[0];

  return row === undefined
    ? undefined
    : mapStoredSecurityEvent(row);
};