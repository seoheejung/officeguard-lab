import { isIP } from 'node:net';

import type {
  NetworkFlowEvent,
  NetworkFlowMetadata,
  NetworkProtocol,
} from '../events/index.js';

// UUID v4 형식 검증 패턴
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// 허용 Network Protocol 목록
const NETWORK_PROTOCOLS =
  new Set<NetworkProtocol>([
    'TCP',
    'UDP',
  ]);

/**
 * NETWORK_FLOW 수신 데이터 검증 오류
 */
export class NetworkFlowEventValidationError
  extends Error {
  public constructor(message: string) {
    super(message);

    this.name = 'NetworkFlowEventValidationError';
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
  const value = record[fieldName];

  if ( typeof value !== 'string' || value.trim() === '' ) {
    throw new NetworkFlowEventValidationError( `${fieldName} must be a non-empty string` );
  }

  return value.trim();
};

/**
 * 선택 문자열 필드 조회
 */
const getOptionalString = (
  record: Record<string, unknown>,
  fieldName: string,
): string | undefined => {
  const value = record[fieldName];

  if (value === undefined) {
    return undefined;
  }

  if ( typeof value !== 'string' || value.trim() === '' ) {
    throw new NetworkFlowEventValidationError( `${fieldName} must be a non-empty string` );
  }

  return value.trim();
};

/**
 * 필수 Port 번호 조회
 */
const getRequiredPort = (
  record: Record<string, unknown>,
  fieldName: string,
): number => {
  const value = record[fieldName];

  if ( typeof value !== 'number' || !Number.isInteger(value) ||
    value < 1 || value > 65_535
  ) {
    throw new NetworkFlowEventValidationError( `${fieldName} must be an integer between 1 and 65535` );
  }

  return value;
};

/**
 * 선택 byte 수 조회
 */
const getOptionalByteCount = (
  record: Record<string, unknown>,
  fieldName: string,
): number | undefined => {
  const value = record[fieldName];

  if (value === undefined) {
    return undefined;
  }

  if ( typeof value !== 'number' ||
    !Number.isSafeInteger(value) || value < 0
  ) {
    throw new NetworkFlowEventValidationError( `${fieldName} must be a non-negative safe integer` );
  }

  return value;
};

/**
 * NETWORK_FLOW 수신 데이터 검증 및 재구성
 */
export const parseNetworkFlowEvent = (
  value: unknown,
): NetworkFlowEvent => {
  // 요청 Body 객체 형식 검증
  if (!isRecord(value)) {
    throw new NetworkFlowEventValidationError( 'request body must be a JSON object' );
  }

  // 이벤트 식별자 조회
  const eventId = getRequiredString( value, 'eventId' );

  // UUID v4 형식 검증
  if (!UUID_V4_PATTERN.test(eventId)) {
    throw new NetworkFlowEventValidationError( 'eventId must be a UUID v4 value' );
  }

  // 이벤트 타입 조회
  const eventType = getRequiredString( value, 'eventType' );

  // NETWORK_FLOW 타입 제한
  if (eventType !== 'NETWORK_FLOW') {
    throw new NetworkFlowEventValidationError( 'eventType must be NETWORK_FLOW' );
  }

  // 이벤트 발생 시각 조회
  const timestamp = getRequiredString( value, 'timestamp' );

  // 이벤트 발생 시각 변환
  const timestampMs = Date.parse(timestamp);

  // 유효한 날짜 값 검증
  if (Number.isNaN(timestampMs)) {
    throw new NetworkFlowEventValidationError( 'timestamp must be a valid date value' );
  }

  // 출발지 IP 조회
  const sourceIp = getRequiredString( value, 'sourceIp' );

  // 출발지 IP 형식 검증
  if (isIP(sourceIp) === 0) {
    throw new NetworkFlowEventValidationError( 'sourceIp must be a valid IP address' );
  }

  // 이벤트 설명 조회
  const message = getRequiredString( value, 'message' );

  // Network Flow 메타데이터 조회
  const metadataValue = value.metadata;

  // 메타데이터 객체 형식 검증
  if (!isRecord(metadataValue)) {
    throw new NetworkFlowEventValidationError( 'metadata must be a JSON object' );
  }

  // 목적지 IP 조회
  const destinationIp = getRequiredString( metadataValue, 'destinationIp' );

  // 목적지 IP 형식 검증
  if (isIP(destinationIp) === 0) {
    throw new NetworkFlowEventValidationError( 'metadata.destinationIp must be a valid IP address' );
  }

  // 목적지 Port 조회
  const destinationPort = getRequiredPort( metadataValue, 'destinationPort' );

  // Network Protocol 조회
  const protocol = getRequiredString( metadataValue, 'protocol' ) as NetworkProtocol;

  // 허용 Protocol 검증
  if (!NETWORK_PROTOCOLS.has(protocol)) {
    throw new NetworkFlowEventValidationError( 'metadata.protocol must be TCP or UDP' );
  }

  // 선택 도메인 조회
  const rawDomain = getOptionalString( metadataValue, 'domain' );

  // 선택 inbound byte 수 조회
  const bytesIn = getOptionalByteCount( metadataValue, 'bytesIn' );

  // 선택 outbound byte 수 조회
  const bytesOut = getOptionalByteCount( metadataValue, 'bytesOut' );

  // Network Flow 필수 메타데이터 구성
  const metadata: NetworkFlowMetadata = {
    destinationIp,
    destinationPort,
    protocol,
  };

  // 선택 도메인 검증 및 반영
  if (rawDomain !== undefined) {
    const domain = rawDomain
      .toLowerCase()
      .replace(/\.$/, '');

    if ( domain.length > 253 || /\s/.test(domain )) {
      throw new NetworkFlowEventValidationError( 'metadata.domain is invalid' );
    }

    metadata.domain = domain;
  }

  // 선택 inbound byte 수 반영
  if (bytesIn !== undefined) {
    metadata.bytesIn = bytesIn;
  }

  // 선택 outbound byte 수 반영
  if (bytesOut !== undefined) {
    metadata.bytesOut = bytesOut;
  }

  // 선택 장치 식별자 조회
  const deviceId = getOptionalString( value, 'deviceId' );

  // 선택 사용자 별칭 조회
  const userAlias = getOptionalString( value, 'userAlias' );

  // 검증 완료 NETWORK_FLOW 이벤트 구성
  const event: NetworkFlowEvent = {
    eventId,
    eventType: 'NETWORK_FLOW',
    timestamp:
      new Date(timestampMs).toISOString(),
    sourceIp,
    message,
    metadata,
  };

  // 전달된 장치 식별자 반영
  if (deviceId !== undefined) {
    event.deviceId = deviceId;
  }

  // 전달된 사용자 별칭 반영
  if (userAlias !== undefined) {
    event.userAlias = userAlias;
  }

  return event;
};