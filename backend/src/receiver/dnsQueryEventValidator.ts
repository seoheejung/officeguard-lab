import { isIP } from 'node:net';

import type {
  DnsAction,
  DnsQueryEvent,
  DnsQueryType,
  DnsResponseCode,
} from '../events/index.js';

// UUID v4 형식 검증 패턴
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// 허용 DNS Query Type 목록
const DNS_QUERY_TYPES =
  new Set<DnsQueryType>([
    'A',
    'AAAA',
    'CNAME',
    'MX',
    'TXT',
    'PTR',
    'NS',
    'OTHER',
  ]);

// 허용 DNS 처리 결과 목록
const DNS_ACTIONS =
  new Set<DnsAction>([
    'ALLOW',
    'BLOCK',
  ]);

// 허용 DNS 응답 코드 목록
const DNS_RESPONSE_CODES =
  new Set<DnsResponseCode>([
    'NOERROR',
    'NXDOMAIN',
    'SERVFAIL',
    'REFUSED',
    'OTHER',
  ]);

/**
 * DNS_QUERY 수신 데이터 검증 오류
 */
export class DnsQueryEventValidationError
  extends Error {
  public constructor(message: string) {
    super(message);

    // 사용자 정의 오류 이름 설정
    this.name =
      'DnsQueryEventValidationError';
  }
}

/**
 * 일반 객체 여부 확인
 */
const isRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * 필수 문자열 필드 조회
 */
const getRequiredString = (
  record: Record<string, unknown>,
  fieldName: string,
): string => {
  // 필드 원본 값 조회
  const value = record[fieldName];

  // 문자열 형식과 빈 값 검증
  if ( typeof value !== 'string' || value.trim() === '' ) {
    throw new DnsQueryEventValidationError( `${fieldName} must be a non-empty string` );
  }

  // 문자열 앞뒤 공백 제거
  return value.trim();
};

/**
 * 선택 문자열 필드 조회
 */
const getOptionalString = (
  record: Record<string, unknown>,
  fieldName: string,
): string | undefined => {
  // 필드 원본 값 조회
  const value = record[fieldName];

  // 미전달 선택 필드 처리
  if (value === undefined) {
    return undefined;
  }

  // 전달된 선택 필드 형식 검증
  if ( typeof value !== 'string' || value.trim() === '' ) {
    throw new DnsQueryEventValidationError( `${fieldName} must be a non-empty string` );
  }

  // 문자열 앞뒤 공백 제거
  return value.trim();
};

/**
 * DNS_QUERY 수신 데이터 검증 및 재구성
 */
export const parseDnsQueryEvent = (
  value: unknown,
): DnsQueryEvent => {
  // 요청 Body 객체 형식 검증
  if (!isRecord(value)) {
    throw new DnsQueryEventValidationError( 'request body must be a JSON object' );
  }

  // 이벤트 식별자 조회
  const eventId = getRequiredString(
    value,
    'eventId',
  );

  // UUID v4 형식 검증
  if (!UUID_V4_PATTERN.test(eventId)) {
    throw new DnsQueryEventValidationError( 'eventId must be a UUID v4 value' );
  }

  // 이벤트 타입 조회
  const eventType = getRequiredString(
    value,
    'eventType',
  );

  // DNS_QUERY 타입 제한
  if (eventType !== 'DNS_QUERY') {
    throw new DnsQueryEventValidationError( 'eventType must be DNS_QUERY' );
  }

  // 이벤트 발생 시각 조회
  const timestamp = getRequiredString(
    value,
    'timestamp',
  );

  // 이벤트 발생 시각 변환
  const timestampMs = Date.parse(timestamp);

  // 유효한 날짜 값 검증
  if (Number.isNaN(timestampMs)) {
    throw new DnsQueryEventValidationError( 'timestamp must be a valid date value' );
  }

  // 출발지 IP 조회
  const sourceIp = getRequiredString(
    value,
    'sourceIp',
  );

  // IPv4 또는 IPv6 형식 검증
  if (isIP(sourceIp) === 0) {
    throw new DnsQueryEventValidationError( 'sourceIp must be a valid IP address' );
  }

  // 이벤트 설명 조회
  const message = getRequiredString(
    value,
    'message',
  );

  // DNS 메타데이터 조회
  const metadataValue = value.metadata;

  // DNS 메타데이터 객체 형식 검증
  if (!isRecord(metadataValue)) {
    throw new DnsQueryEventValidationError( 'metadata must be a JSON object' );
  }

  // 조회 도메인 정규화
  const domain = getRequiredString(
    metadataValue,
    'domain',
  )
    .toLowerCase()
    .replace(/\.$/, '');

  // 도메인 길이와 공백 포함 여부 검증
  if ( domain.length > 253 || /\s/.test(domain) ) {
    throw new DnsQueryEventValidationError( 'metadata.domain is invalid' );
  }

  // DNS Query Type 조회
  const queryType = getRequiredString(
    metadataValue,
    'queryType',
  ) as DnsQueryType;

  // 허용 DNS Query Type 검증
  if (!DNS_QUERY_TYPES.has(queryType)) {
    throw new DnsQueryEventValidationError( 'metadata.queryType is invalid' );
  }

  // DNS 처리 결과 조회
  const action = getRequiredString(
    metadataValue,
    'action',
  ) as DnsAction;

  // 허용 DNS 처리 결과 검증
  if (!DNS_ACTIONS.has(action)) {
    throw new DnsQueryEventValidationError( 'metadata.action is invalid' );
  }

  // DNS 응답 코드 조회
  const responseCode =
    getRequiredString(
      metadataValue,
      'responseCode',
    ) as DnsResponseCode;

  // 허용 DNS 응답 코드 검증
  if ( !DNS_RESPONSE_CODES.has(responseCode)) {
    throw new DnsQueryEventValidationError( 'metadata.responseCode is invalid' );
  }

  // 선택 장치 식별자 조회
  const deviceId = getOptionalString(
    value,
    'deviceId',
  );

  // 선택 사용자 별칭 조회
  const userAlias = getOptionalString(
    value,
    'userAlias',
  );

  // 검증된 필드 기반 DNS_QUERY 이벤트 재구성
  const event: DnsQueryEvent = {
    eventId,
    eventType: 'DNS_QUERY',
    timestamp:
      new Date(timestampMs).toISOString(),
    sourceIp,
    message,
    metadata: {
      domain,
      queryType,
      action,
      responseCode,
    },
  };

  // 전달된 장치 식별자 반영
  if (deviceId !== undefined) {
    event.deviceId = deviceId;
  }

  // 전달된 사용자 별칭 반영
  if (userAlias !== undefined) {
    event.userAlias = userAlias;
  }

  // 검증 완료 이벤트 반환
  return event;
};
