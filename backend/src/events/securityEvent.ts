import type { DnsQueryEvent } from './dnsEvent.js';
import type { EndpointEvent } from './endpointEvent.js';
import type { NetworkFlowEvent } from './networkFlowEvent.js';
import type { RuleHitEvent } from './ruleHitEvent.js';

/**
 * OfficeGuard Lab의 수집, 전달, 분석, 저장 과정에서 사용하는 전체 보안 이벤트 union 타입
 */
export type SecurityEvent =
  | DnsQueryEvent
  | NetworkFlowEvent
  | EndpointEvent
  | RuleHitEvent;