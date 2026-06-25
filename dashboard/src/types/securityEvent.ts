export type SecurityEventType =
  | 'DNS_QUERY'
  | 'NETWORK_FLOW'
  | 'PROCESS_START'
  | 'FILE_CREATED'
  | 'FILE_MODIFIED'
  | 'FILE_DELETED'
  | 'FILE_COPIED'
  | 'USB_CONNECTED'
  | 'USB_DISCONNECTED'
  | 'PRINT_REQUESTED'
  | 'EMAIL_ATTACHMENT_SENT'
  | 'RULE_HIT';

export type SecuritySeverity =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

/**
 * Dashboard 표시 SecurityEvent
 */
export interface DashboardSecurityEvent {
  eventId: string;
  eventType: SecurityEventType;
  timestamp: string;
  sourceIp?: string;
  deviceId?: string;
  userAlias?: string;
  severity?: SecuritySeverity;
  message: string;
  metadata: Record<string, unknown>;
  storedAt?: string;
}

/**
 * SecurityEvent 목록 조회 응답
 */
export interface SecurityEventListResponse {
  count: number;
  items: DashboardSecurityEvent[];
}

/**
 * Backend WebSocket SecurityEvent 메시지
 */
export interface SecurityEventMessage {
  type: 'SECURITY_EVENT';
  payload: DashboardSecurityEvent;
}

/**
 * DNS Query 도메인 조회
 */
export const getDnsDomain = (
  event: DashboardSecurityEvent,
): string | undefined => {
  if (event.eventType !== 'DNS_QUERY') {
    return undefined;
  }

  const domain = event.metadata.domain;

  return typeof domain === 'string'
    ? domain
    : undefined;
};

/**
 * Rule Hit Rule ID 조회
 */
export const getRuleId = (
  event: DashboardSecurityEvent,
): string | undefined => {
  if (event.eventType !== 'RULE_HIT') {
    return undefined;
  }

  const ruleId = event.metadata.ruleId;

  return typeof ruleId === 'string'
    ? ruleId
    : undefined;
};