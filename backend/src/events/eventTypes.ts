/**
 * DNS Collector가 생성하는 이벤트 타입
 */
export type DnsEventType = 'DNS_QUERY';

/**
 * Network Flow Collector가 생성하는 이벤트 타입
 */
export type NetworkEventType = 'NETWORK_FLOW';

/**
 * 테스트 단말 또는 Endpoint Agent가 생성하는 이벤트 타입
 */
export type EndpointEventType =
  | 'PROCESS_START'
  | 'FILE_CREATED'
  | 'FILE_MODIFIED'
  | 'FILE_DELETED'
  | 'FILE_COPIED'
  | 'USB_CONNECTED'
  | 'USB_DISCONNECTED'
  | 'PRINT_REQUESTED'
  | 'EMAIL_ATTACHMENT_SENT';

/**
 * Rule-based Analyzer가 생성하는 이벤트 타입
 */
export type RuleEventType = 'RULE_HIT';

/**
 * OfficeGuard Lab에서 처리하는 전체 보안 이벤트 타입
 */
export type SecurityEventType =
  | DnsEventType
  | NetworkEventType
  | EndpointEventType
  | RuleEventType;

/**
 * Analyzer가 판단한 보안 이벤트 위험도
 */
export type SecuritySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * 모든 보안 이벤트가 공유하는 공통 필드
 */
export interface SecurityEventBase<
  TEventType extends SecurityEventType,
  TMetadata extends object,
> {
  /**
   * 이벤트를 식별하는 고유 ID
   *
   * 실제 이벤트 생성 단계에서는 crypto.randomUUID()를 사용
   */
  eventId: string;

  /**
   * 이벤트 종류를 구분하는 판별자
   */
  eventType: TEventType;

  /**
   * 이벤트 발생 시각을 나타내는 ISO 8601 문자열
   */
  timestamp: string;

  /**
   * 이벤트가 발생한 단말 또는 네트워크의 내부 IP
   * DNS와 Network Flow 이벤트에서는 필수로 재정의
   */
  sourceIp?: string;

  /**
   * Endpoint 이벤트가 발생한 테스트 단말의 식별자
   */
  deviceId?: string;

  /**
   * 사용자를 구분해야 할 때 사용하는 익명화된 별칭
   */
  userAlias?: string;

  /**
   * 이벤트 위험도
   *
   * 원본 수집 이벤트에서는 생략할 수 있으며 RULE_HIT 이벤트에서는 필수로 재정의
   */
  severity?: SecuritySeverity;

  /**
   * Dashboard와 로그에 표시할 사람이 읽을 수 있는 설명
   */
  message: string;

  /**
   * 이벤트 타입별 세부 데이터
   */
  metadata: TMetadata;
}