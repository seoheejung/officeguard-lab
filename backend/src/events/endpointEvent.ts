import type {
  EndpointEventType,
  SecurityEventBase,
} from './eventTypes.js';

/**
 * Endpoint 이벤트는 이벤트가 발생한 단말 식별자가 반드시 필요
 */
type EndpointSecurityEvent<
  TEventType extends EndpointEventType,
  TMetadata extends object,
> = SecurityEventBase<TEventType, TMetadata> & {
  deviceId: string;
};

/**
 * 프로세스 실행 이벤트의 세부 데이터
 */
export interface ProcessStartMetadata {
  processName: string;
  processId: number;
  parentProcessId?: number;
  executablePath?: string;
}

/**
 * 파일 생성, 수정, 삭제 이벤트가 공유하는 세부 데이터
 */
export interface FileEventMetadata {
  path: string;
  sizeBytes?: number;
  extension?: string;
}

/**
 * 파일 복사 이벤트의 세부 데이터
 */
export interface FileCopiedMetadata {
  sourcePath: string;
  destinationPath: string;
  sizeBytes?: number;
}

/**
 * USB 연결 및 해제 이벤트의 세부 데이터
 */
export interface UsbDeviceMetadata {
  vendor?: string;
  productName?: string;

  /**
   * 원본 USB 시리얼 번호를 직접 저장하지 않고 마스킹하거나 해시 처리한 별칭을 사용
   */
  serialAlias?: string;
}

/**
 * 출력 요청 이벤트의 세부 데이터
 */
export interface PrintRequestedMetadata {
  printerName: string;

  /**
   * 실제 문서명 대신 마스킹된 별칭 사용
   */
  documentAlias?: string;

  pageCount?: number;
}

/**
 * 프로세스 실행 이벤트
 */
export type ProcessStartEvent = EndpointSecurityEvent<
  'PROCESS_START',
  ProcessStartMetadata
>;

/**
 * 파일 생성 이벤트
 */
export type FileCreatedEvent = EndpointSecurityEvent<
  'FILE_CREATED',
  FileEventMetadata
>;

/**
 * 파일 수정 이벤트
 */
export type FileModifiedEvent = EndpointSecurityEvent<
  'FILE_MODIFIED',
  FileEventMetadata
>;

/**
 * 파일 삭제 이벤트
 */
export type FileDeletedEvent = EndpointSecurityEvent<
  'FILE_DELETED',
  FileEventMetadata
>;

/**
 * 파일 복사 이벤트
 */
export type FileCopiedEvent = EndpointSecurityEvent<
  'FILE_COPIED',
  FileCopiedMetadata
>;

/**
 * USB 연결 이벤트
 */
export type UsbConnectedEvent = EndpointSecurityEvent<
  'USB_CONNECTED',
  UsbDeviceMetadata
>;

/**
 * USB 연결 해제 이벤트
 */
export type UsbDisconnectedEvent = EndpointSecurityEvent<
  'USB_DISCONNECTED',
  UsbDeviceMetadata
>;

/**
 * 프린트 요청 이벤트
 */
export type PrintRequestedEvent = EndpointSecurityEvent<
  'PRINT_REQUESTED',
  PrintRequestedMetadata
>;

/**
 * OfficeGuard Lab에서 처리하는 전체 Endpoint 이벤트
 */
export type EndpointEvent =
  | ProcessStartEvent
  | FileCreatedEvent
  | FileModifiedEvent
  | FileDeletedEvent
  | FileCopiedEvent
  | UsbConnectedEvent
  | UsbDisconnectedEvent
  | PrintRequestedEvent;