import type {
  SecurityEventBase,
  SecuritySeverity,
} from './eventTypes.js';

/**
 * RULE_HIT 이벤트의 세부 데이터
 */
export interface RuleHitMetadata {
  /**
   * 탐지에 사용된 Rule의 고유 ID
   */
  ruleId: string;

  /**
   * Rule Hit 발생에 관련된 원본 이벤트 ID 목록
   * 이후 이벤트 타임라인에서 탐지 근거를 추적할 때 사용
   */
  relatedEventIds: string[];

  /**
   * 연속 이벤트를 분석한 시간 범위
   */
  windowSeconds?: number;
}

/**
 * Rule-based Analyzer가 이상 행위를 탐지했을 때 생성하는 이벤트
 * RULE_HIT은 탐지 결과이므로 severity가 반드시 필요
 */
export type RuleHitEvent = SecurityEventBase<
  'RULE_HIT',
  RuleHitMetadata
> & {
  severity: SecuritySeverity;
};