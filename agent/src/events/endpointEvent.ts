import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';

/**
 * Endpoint Event 공통 실행 환경
 */
export interface EndpointEventContext {
  sourceIp: string;
  deviceId: string;
  userAlias?: string;
}

/**
 * Endpoint Event 공통 구조
 */
interface EndpointEventBase<
  TEventType extends string,
  TMetadata extends object,
> {
  eventId: string;
  eventType: TEventType;
  timestamp: string;
  sourceIp: string;
  deviceId: string;
  userAlias?: string;
  message: string;
  metadata: TMetadata;
}

/**
 * Endpoint Event 공통 생성 필드
 */
interface EndpointEventCommonFields {
  eventId: string;
  timestamp: string;
  sourceIp: string;
  deviceId: string;
  userAlias?: string;
}

export interface ProcessStartMetadata {
  processName: string;
  processId: number;
  parentProcessId?: number;
  executablePath?: string;
}

export interface FileEventMetadata {
  path: string;
  sizeBytes?: number;
  extension?: string;
}

export interface FileCopiedMetadata {
  sourcePath: string;
  destinationPath: string;
  sizeBytes?: number;
}

export interface UsbDeviceMetadata {
  vendor?: string;
  productName?: string;
  serialAlias?: string;
}

export interface PrintRequestedMetadata {
  printerName: string;
  documentAlias?: string;
  pageCount?: number;
}

export type ProcessStartEvent = EndpointEventBase<
  'PROCESS_START',
  ProcessStartMetadata
>;

export type FileCreatedEvent = EndpointEventBase<
  'FILE_CREATED',
  FileEventMetadata
>;

export type FileModifiedEvent = EndpointEventBase<
  'FILE_MODIFIED',
  FileEventMetadata
>;

export type FileDeletedEvent = EndpointEventBase<
  'FILE_DELETED',
  FileEventMetadata
>;

export type FileCopiedEvent = EndpointEventBase<
  'FILE_COPIED',
  FileCopiedMetadata
>;

export type UsbConnectedEvent = EndpointEventBase<
  'USB_CONNECTED',
  UsbDeviceMetadata
>;

export type UsbDisconnectedEvent = EndpointEventBase<
  'USB_DISCONNECTED',
  UsbDeviceMetadata
>;

export type PrintRequestedEvent = EndpointEventBase<
  'PRINT_REQUESTED',
  PrintRequestedMetadata
>;

export type EndpointEvent =
  | ProcessStartEvent
  | FileCreatedEvent
  | FileModifiedEvent
  | FileDeletedEvent
  | FileCopiedEvent
  | UsbConnectedEvent
  | UsbDisconnectedEvent
  | PrintRequestedEvent;

/**
 * Windows 프로세스 시작 수집 결과
 */
export interface WindowsProcessStartRecord {
  timestamp: string;
  processName: string;
  processId: number;
  parentProcessId: number;
  executablePath?: string;
}

export type WindowsFileChangeType = 'CREATED' | 'MODIFIED' | 'DELETED';

/**
 * Windows 파일 변경 수집 결과
 */
export interface WindowsFileRecord {
  timestamp: string;
  changeType: WindowsFileChangeType;
  path: string;
  sizeBytes?: number;
}

export type WindowsUsbChangeType = 'CONNECTED' | 'DISCONNECTED';

/**
 * Windows USB 저장 장치 수집 결과
 */
export interface WindowsUsbDeviceRecord {
  timestamp: string;
  changeType: WindowsUsbChangeType;
  deviceKey: string;
  vendor?: string;
  productName?: string;
  driveLetters: string[];
}

/**
 * Windows Print Job 수집 결과
 */
export interface WindowsPrintJobRecord {
  timestamp: string;
  printerName: string;
  jobId: number;
  documentName?: string;
  pageCount?: number;
}

/**
 * FILE_COPIED 생성 입력값
 */
interface CreateFileCopiedEventInput {
  timestamp: string;
  sourcePath: string;
  destinationPath: string;
  sizeBytes?: number;
}

/**
 * ISO 8601 발생 시각 변환
 */
const normalizeTimestamp = (timestamp: string): string | undefined => {
  const timestampMs = Date.parse(timestamp);

  if (Number.isNaN(timestampMs)) {
    return undefined;
  }

  return new Date(timestampMs).toISOString();
};

/**
 * 공통 Endpoint Event 필드 생성
 */
const createCommonFields = (
  timestamp: string,
  context: EndpointEventContext,
): EndpointEventCommonFields | undefined => {
  const normalizedTimestamp = normalizeTimestamp(timestamp);

  if (normalizedTimestamp === undefined) {
    return undefined;
  }

  // 이벤트별 신규 UUID와 정규화 시각 생성
  const fields: EndpointEventCommonFields = {
    eventId: randomUUID(),
    timestamp: normalizedTimestamp,
    sourceIp: context.sourceIp,
    deviceId: context.deviceId,
  };

  if (context.userAlias !== undefined) {
    fields.userAlias = context.userAlias;
  }

  return fields;
};

/**
 * 원본 식별값의 SHA-256 별칭 생성
 */
const createAlias = (value: string): string =>
  createHash('sha256')
    .update(value, 'utf8')
    .digest('hex')
    .slice(0, 16);

/**
 * PROCESS_START 이벤트 생성
 */
export const createProcessStartEvent = (
  record: WindowsProcessStartRecord,
  context: EndpointEventContext,
): ProcessStartEvent | undefined => {
  const common = createCommonFields(record.timestamp, context);

  // 필수 프로세스 정보 검증
  if (
    common === undefined ||
    record.processName.trim() === '' ||
    !Number.isSafeInteger(record.processId) ||
    record.processId < 1 ||
    !Number.isSafeInteger(record.parentProcessId) ||
    record.parentProcessId < 0
  ) {
    return undefined;
  }

  const metadata: ProcessStartMetadata = {
    processName: record.processName.trim(),
    processId: record.processId,
    parentProcessId: record.parentProcessId,
  };

  // 확인 가능한 실행 경로만 선택 반영
  if (
    record.executablePath !== undefined &&
    record.executablePath.trim() !== ''
  ) {
    metadata.executablePath = record.executablePath.trim();
  }

  return {
    ...common,
    eventType: 'PROCESS_START',
    message: `${metadata.processName} 프로세스가 시작되었습니다.`,
    metadata,
  };
};

/**
 * 파일 이벤트 생성
 */
export const createFileEvent = (
  record: WindowsFileRecord,
  context: EndpointEventContext,
):
  | FileCreatedEvent
  | FileModifiedEvent
  | FileDeletedEvent
  | undefined => {
  const common = createCommonFields(record.timestamp, context);
  const path = record.path.trim();

  // 파일 경로와 선택 크기 검증
  if (
    common === undefined ||
    path === '' ||
    (record.sizeBytes !== undefined &&
      (!Number.isSafeInteger(record.sizeBytes) || record.sizeBytes < 0))
  ) {
    return undefined;
  }

  const extension = extname(path);
  const metadata: FileEventMetadata = { path };

  if (record.sizeBytes !== undefined) {
    metadata.sizeBytes = record.sizeBytes;
  }

  if (extension !== '') {
    metadata.extension = extension;
  }

  // Windows 변경 타입의 SecurityEvent 변환
  switch (record.changeType) {
    case 'CREATED':
      return {
        ...common,
        eventType: 'FILE_CREATED',
        message: `${path} 파일이 생성되었습니다.`,
        metadata,
      };

    case 'MODIFIED':
      return {
        ...common,
        eventType: 'FILE_MODIFIED',
        message: `${path} 파일이 수정되었습니다.`,
        metadata,
      };

    case 'DELETED':
      return {
        ...common,
        eventType: 'FILE_DELETED',
        message: `${path} 파일이 삭제되었습니다.`,
        metadata,
      };
  }
};

/**
 * FILE_COPIED 이벤트 생성
 */
export const createFileCopiedEvent = (
  input: CreateFileCopiedEventInput,
  context: EndpointEventContext,
): FileCopiedEvent | undefined => {
  const common = createCommonFields(input.timestamp, context);
  const sourcePath = input.sourcePath.trim();
  const destinationPath = input.destinationPath.trim();

  // 확인 완료 원본·대상 경로 검증
  if (
    common === undefined ||
    sourcePath === '' ||
    destinationPath === '' ||
    (input.sizeBytes !== undefined &&
      (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 0))
  ) {
    return undefined;
  }

  const metadata: FileCopiedMetadata = {
    sourcePath,
    destinationPath,
  };

  if (input.sizeBytes !== undefined) {
    metadata.sizeBytes = input.sizeBytes;
  }

  return {
    ...common,
    eventType: 'FILE_COPIED',
    message: `${destinationPath} 파일의 이동식 저장 장치 복사가 감지되었습니다.`,
    metadata,
  };
};

/**
 * USB_CONNECTED 또는 USB_DISCONNECTED 이벤트 생성
 */
export const createUsbDeviceEvent = (
  record: WindowsUsbDeviceRecord,
  context: EndpointEventContext,
): UsbConnectedEvent | UsbDisconnectedEvent | undefined => {
  const common = createCommonFields(record.timestamp, context);
  const deviceKey = record.deviceKey.trim();

  if (common === undefined || deviceKey === '') {
    return undefined;
  }

  // 원본 장치 식별값 대신 해시 별칭 저장
  const metadata: UsbDeviceMetadata = {
    serialAlias: createAlias(deviceKey),
  };

  if (record.vendor !== undefined && record.vendor.trim() !== '') {
    metadata.vendor = record.vendor.trim();
  }

  if (
    record.productName !== undefined &&
    record.productName.trim() !== ''
  ) {
    metadata.productName = record.productName.trim();
  }

  if (record.changeType === 'CONNECTED') {
    return {
      ...common,
      eventType: 'USB_CONNECTED',
      message: 'USB 저장 장치가 연결되었습니다.',
      metadata,
    };
  }

  return {
    ...common,
    eventType: 'USB_DISCONNECTED',
    message: 'USB 저장 장치 연결이 해제되었습니다.',
    metadata,
  };
};

/**
 * PRINT_REQUESTED 이벤트 생성
 */
export const createPrintRequestedEvent = (
  record: WindowsPrintJobRecord,
  context: EndpointEventContext,
): PrintRequestedEvent | undefined => {
  const common = createCommonFields(record.timestamp, context);
  const printerName = record.printerName.trim();

  // 프린터 이름과 Print Job ID 검증
  if (
    common === undefined ||
    printerName === '' ||
    !Number.isSafeInteger(record.jobId) ||
    record.jobId < 1
  ) {
    return undefined;
  }

  const metadata: PrintRequestedMetadata = { printerName };

  // 실제 문서명 대신 해시 별칭 저장
  if (
    record.documentName !== undefined &&
    record.documentName.trim() !== ''
  ) {
    metadata.documentAlias = createAlias(record.documentName.trim());
  }

  // 확인 가능한 양의 페이지 수만 반영
  if (
    record.pageCount !== undefined &&
    Number.isSafeInteger(record.pageCount) &&
    record.pageCount > 0
  ) {
    metadata.pageCount = record.pageCount;
  }

  return {
    ...common,
    eventType: 'PRINT_REQUESTED',
    message: `${printerName} 프린터에 인쇄가 요청되었습니다.`,
    metadata,
  };
};