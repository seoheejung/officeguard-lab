import { isIP } from 'node:net';

import type {
  EndpointEvent,
  FileCopiedEvent,
  FileCopiedMetadata,
  FileCreatedEvent,
  FileDeletedEvent,
  FileEventMetadata,
  FileModifiedEvent,
  PrintRequestedEvent,
  PrintRequestedMetadata,
  ProcessStartEvent,
  ProcessStartMetadata,
  UsbConnectedEvent,
  UsbDeviceMetadata,
  UsbDisconnectedEvent,
} from '../events/index.js';

// UUID v4 형식 검증
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 검증 완료 Endpoint Event 공통 필드
 */
interface EndpointEventCommonFields {
  eventId: string;
  timestamp: string;
  sourceIp?: string;
  deviceId: string;
  userAlias?: string;
  message: string;
}

/**
 * Endpoint Event 검증 오류
 */
export class EndpointEventValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'EndpointEventValidationError';
  }
}

/**
 * 일반 JSON 객체 여부 확인
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * 필수 문자열 필드 조회
 */
const getRequiredString = (
  record: Record<string, unknown>,
  fieldName: string,
): string => {
  const value = record[fieldName];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new EndpointEventValidationError( `${fieldName} must be a non-empty string` );
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

  if (typeof value !== 'string' || value.trim() === '') {
    throw new EndpointEventValidationError( `${fieldName} must be a non-empty string` );
  }

  return value.trim();
};

/**
 * 필수 양의 정수 필드 조회
 */
const getRequiredPositiveInteger = (
  record: Record<string, unknown>,
  fieldName: string,
): number => {
  const value = record[fieldName];

  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new EndpointEventValidationError( `${fieldName} must be a positive safe integer` );
  }

  return value;
};

/**
 * 선택 0 이상 정수 필드 조회
 */
const getOptionalNonNegativeInteger = (
  record: Record<string, unknown>,
  fieldName: string,
): number | undefined => {
  const value = record[fieldName];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new EndpointEventValidationError( `${fieldName} must be a non-negative safe integer` );
  }

  return value;
};

/**
 * 공통 Endpoint Event 필드 검증
 */
const parseCommonFields = (
  value: Record<string, unknown>,
): EndpointEventCommonFields => {
  const eventId = getRequiredString(value, 'eventId');

  // 외부 입력 eventId의 UUID v4 형식 확인
  if (!UUID_V4_PATTERN.test(eventId)) {
    throw new EndpointEventValidationError( 'eventId must be a UUID v4 string' );
  }

  const timestamp = getRequiredString(value, 'timestamp');
  const timestampMs = Date.parse(timestamp);

  // 파싱 불가능한 timestamp 차단
  if (Number.isNaN(timestampMs)) {
    throw new EndpointEventValidationError( 'timestamp must be a valid date string' );
  }

  const sourceIp = getOptionalString(value, 'sourceIp');

  // IPv4 또는 IPv6 형식 확인
  if (sourceIp !== undefined && isIP(sourceIp) === 0) {
    throw new EndpointEventValidationError( 'sourceIp must be a valid IP address' );
  }

  const deviceId = getRequiredString(value, 'deviceId');
  const userAlias = getOptionalString(value, 'userAlias');
  const message = getRequiredString(value, 'message');

  // 검증 완료 필드만 사용한 공통 객체 구성
  const commonFields: EndpointEventCommonFields = {
    eventId,
    timestamp: new Date(timestampMs).toISOString(),
    deviceId,
    message,
  };

  if (sourceIp !== undefined) {
    commonFields.sourceIp = sourceIp;
  }

  if (userAlias !== undefined) {
    commonFields.userAlias = userAlias;
  }

  return commonFields;
};

/**
 * metadata JSON 객체 조회
 */
const getMetadata = (
  value: Record<string, unknown>,
): Record<string, unknown> => {
  const metadata = value.metadata;

  if (!isRecord(metadata)) {
    throw new EndpointEventValidationError( 'metadata must be a JSON object', );
  }

  return metadata;
};

/**
 * PROCESS_START 이벤트 검증
 */
const parseProcessStartEvent = (
  value: Record<string, unknown>,
): ProcessStartEvent => {
  const common = parseCommonFields(value);
  const metadataValue = getMetadata(value);

  const metadata: ProcessStartMetadata = {
    processName: getRequiredString(metadataValue, 'processName'),
    processId: getRequiredPositiveInteger(metadataValue, 'processId'),
  };

  const parentProcessId = getOptionalNonNegativeInteger(
    metadataValue,
    'parentProcessId',
  );
  const executablePath = getOptionalString(metadataValue, 'executablePath');

  if (parentProcessId !== undefined) {
    metadata.parentProcessId = parentProcessId;
  }

  if (executablePath !== undefined) {
    metadata.executablePath = executablePath;
  }

  return {
    ...common,
    eventType: 'PROCESS_START',
    metadata,
  };
};

/**
 * 파일 이벤트 공통 metadata 검증
 */
const parseFileMetadata = (
  metadataValue: Record<string, unknown>,
): FileEventMetadata => {
  const metadata: FileEventMetadata = {
    path: getRequiredString(metadataValue, 'path'),
  };

  const sizeBytes = getOptionalNonNegativeInteger(metadataValue, 'sizeBytes');
  const extension = getOptionalString(metadataValue, 'extension');

  if (sizeBytes !== undefined) {
    metadata.sizeBytes = sizeBytes;
  }

  if (extension !== undefined) {
    metadata.extension = extension;
  }

  return metadata;
};

/**
 * FILE_CREATED 이벤트 검증
 */
const parseFileCreatedEvent = (
  value: Record<string, unknown>,
): FileCreatedEvent => ({
  ...parseCommonFields(value),
  eventType: 'FILE_CREATED',
  metadata: parseFileMetadata(getMetadata(value)),
});

/**
 * FILE_MODIFIED 이벤트 검증
 */
const parseFileModifiedEvent = (
  value: Record<string, unknown>,
): FileModifiedEvent => ({
  ...parseCommonFields(value),
  eventType: 'FILE_MODIFIED',
  metadata: parseFileMetadata(getMetadata(value)),
});

/**
 * FILE_DELETED 이벤트 검증
 */
const parseFileDeletedEvent = (
  value: Record<string, unknown>,
): FileDeletedEvent => ({
  ...parseCommonFields(value),
  eventType: 'FILE_DELETED',
  metadata: parseFileMetadata(getMetadata(value)),
});

/**
 * FILE_COPIED 이벤트 검증
 */
const parseFileCopiedEvent = (
  value: Record<string, unknown>,
): FileCopiedEvent => {
  const common = parseCommonFields(value);
  const metadataValue = getMetadata(value);

  const metadata: FileCopiedMetadata = {
    sourcePath: getRequiredString(metadataValue, 'sourcePath'),
    destinationPath: getRequiredString(metadataValue, 'destinationPath'),
  };

  const sizeBytes = getOptionalNonNegativeInteger(metadataValue, 'sizeBytes');

  if (sizeBytes !== undefined) {
    metadata.sizeBytes = sizeBytes;
  }

  return {
    ...common,
    eventType: 'FILE_COPIED',
    metadata,
  };
};

/**
 * USB 이벤트 공통 metadata 검증
 */
const parseUsbMetadata = (
  metadataValue: Record<string, unknown>,
): UsbDeviceMetadata => {
  const metadata: UsbDeviceMetadata = {};

  const vendor = getOptionalString(metadataValue, 'vendor');
  const productName = getOptionalString(metadataValue, 'productName');
  const serialAlias = getOptionalString(metadataValue, 'serialAlias');

  if (vendor !== undefined) {
    metadata.vendor = vendor;
  }

  if (productName !== undefined) {
    metadata.productName = productName;
  }

  if (serialAlias !== undefined) {
    metadata.serialAlias = serialAlias;
  }

  return metadata;
};

/**
 * USB_CONNECTED 이벤트 검증
 */
const parseUsbConnectedEvent = (
  value: Record<string, unknown>,
): UsbConnectedEvent => ({
  ...parseCommonFields(value),
  eventType: 'USB_CONNECTED',
  metadata: parseUsbMetadata(getMetadata(value)),
});

/**
 * USB_DISCONNECTED 이벤트 검증
 */
const parseUsbDisconnectedEvent = (
  value: Record<string, unknown>,
): UsbDisconnectedEvent => ({
  ...parseCommonFields(value),
  eventType: 'USB_DISCONNECTED',
  metadata: parseUsbMetadata(getMetadata(value)),
});

/**
 * PRINT_REQUESTED 이벤트 검증
 */
const parsePrintRequestedEvent = (
  value: Record<string, unknown>,
): PrintRequestedEvent => {
  const common = parseCommonFields(value);
  const metadataValue = getMetadata(value);

  const metadata: PrintRequestedMetadata = {
    printerName: getRequiredString(metadataValue, 'printerName'),
  };

  const documentAlias = getOptionalString(metadataValue, 'documentAlias');
  const pageCount = getOptionalNonNegativeInteger(metadataValue, 'pageCount');

  if (documentAlias !== undefined) {
    metadata.documentAlias = documentAlias;
  }

  // 0은 유효한 페이지 수로 저장하지 않음
  if (pageCount !== undefined && pageCount > 0) {
    metadata.pageCount = pageCount;
  }

  return {
    ...common,
    eventType: 'PRINT_REQUESTED',
    metadata,
  };
};

/**
 * Endpoint Event 타입별 검증 및 재구성
 */
export const parseEndpointEvent = (value: unknown): EndpointEvent => {
  if (!isRecord(value)) {
    throw new EndpointEventValidationError( 'request body must be a JSON object' );
  }

  // eventType 기준 Validator 분기
  switch (value.eventType) {
    case 'PROCESS_START':
      return parseProcessStartEvent(value);

    case 'FILE_CREATED':
      return parseFileCreatedEvent(value);

    case 'FILE_MODIFIED':
      return parseFileModifiedEvent(value);

    case 'FILE_DELETED':
      return parseFileDeletedEvent(value);

    case 'FILE_COPIED':
      return parseFileCopiedEvent(value);

    case 'USB_CONNECTED':
      return parseUsbConnectedEvent(value);

    case 'USB_DISCONNECTED':
      return parseUsbDisconnectedEvent(value);

    case 'PRINT_REQUESTED':
      return parsePrintRequestedEvent(value);

      default:
      throw new EndpointEventValidationError(
        'unsupported Endpoint Event type',
      );
  }
};