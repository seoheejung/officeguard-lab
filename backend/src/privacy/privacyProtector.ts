import { createHmac } from 'node:crypto';

import {
  privacyConfig,
  type PrivacyConfig,
} from '../config/privacyConfig.js';
import type { SecurityEvent } from '../events/index.js';

// 익명화된 Source IP 식별자에 사용하는 접두사
const SOURCE_IP_ALIAS_PREFIX = 'anon-ip-';

// 이미 익명화된 Source IP 식별자 형식 확인
const SOURCE_IP_ALIAS_PATTERN = /^anon-ip-[0-9a-f]{24}$/;

// 민감 도메인을 대체할 고정 마스킹 값
const MASKED_DOMAIN = '[masked-domain]';


/**
 * 도메인 비교 형식 정규화
 */
const normalizeDomain = (domain: string): string =>
  domain.trim().toLowerCase().replace(/\.$/, '');

/**
 * 정규식 특수문자 Escape
 */
const escapeRegularExpression = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 이벤트 메시지에 포함된 원본 도메인 마스킹
 */
const maskDomainInMessage = (
  message: string,
  domain: string,
): string =>
  message.replace(
    new RegExp(escapeRegularExpression(domain), 'gi'),
    MASKED_DOMAIN,
  );

/**
 * SecurityEvent 개인정보 보호 처리
 */
export class PrivacyProtector {
  public constructor(
    private readonly config: Readonly<PrivacyConfig>,
  ) {}

  /**
   * Source IP 익명 식별자 변환
   */
  public protectSourceIp(sourceIp: string): string {
    if (!this.config.sourceIpAnonymizationEnabled) {
      return sourceIp;
    }

    const normalizedSourceIp = sourceIp.trim().toLowerCase();

    // 기존 익명 식별자 재변환 방지
    if (SOURCE_IP_ALIAS_PATTERN.test(normalizedSourceIp)) {
      return normalizedSourceIp;
    }

    const anonymizationKey =
      this.config.sourceIpAnonymizationKey;

    if (anonymizationKey === undefined) {
      throw new Error( '[privacy] source IP anonymization key not configured' );
    }

    // 동일 IP에 동일한 익명 식별자를 생성하기 위한 HMAC 적용
    const digest = createHmac('sha256', anonymizationKey)
      .update(normalizedSourceIp)
      .digest('hex')
      .slice(0, 24);

    return `${SOURCE_IP_ALIAS_PREFIX}${digest}`;
  }

  /**
   * 저장 및 표시용 SecurityEvent 보호 사본 생성
   */
  public protectSecurityEvent(
    event: SecurityEvent,
  ): SecurityEvent {
    // Analyzer에서 사용할 원본 이벤트 불변 유지
    const protectedEvent = structuredClone(event);

    // Source IP 익명화
    if (protectedEvent.sourceIp !== undefined) {
      protectedEvent.sourceIp = this.protectSourceIp(
        protectedEvent.sourceIp,
      );
    }

    if (!this.config.domainMaskingEnabled) {
      return protectedEvent;
    }

    // 도메인 필드를 가진 이벤트만 마스킹 처리
    switch (protectedEvent.eventType) {
      case 'DNS_QUERY':
        this.maskDnsQueryDomain(protectedEvent);
        break;

      case 'NETWORK_FLOW':
        this.maskNetworkFlowDomain(protectedEvent);
        break;

      default:
        break;
    }

    return protectedEvent;
  }

  /**
   * DNS Query 민감 도메인 마스킹
   */
  private maskDnsQueryDomain(
    event: Extract<
      SecurityEvent,
      { eventType: 'DNS_QUERY' }
    >,
  ): void {
    const domain = normalizeDomain(event.metadata.domain);

    if (!this.isSensitiveDomain(domain)) {
      return;
    }

    // Metadata와 사용자 표시 메시지의 원본 도메인 제거
    event.metadata.domain = MASKED_DOMAIN;
    event.message = maskDomainInMessage(event.message, domain);
  }

  /**
   * Network Flow 민감 도메인 마스킹
   */
  private maskNetworkFlowDomain(
    event: Extract<
      SecurityEvent,
      { eventType: 'NETWORK_FLOW' }
    >,
  ): void {
    const rawDomain = event.metadata.domain;

    // 도메인이 수집되지 않은 Network Flow 제외
    if (rawDomain === undefined) {
      return;
    }

    const domain = normalizeDomain(rawDomain);

    if (!this.isSensitiveDomain(domain)) {
      return;
    }

    // Metadata와 사용자 표시 메시지의 원본 도메인 제거
    event.metadata.domain = MASKED_DOMAIN;
    event.message = maskDomainInMessage(event.message, domain);
  }

  /**
   * 등록 도메인 또는 하위 도메인 여부 확인
   */
  private isSensitiveDomain(domain: string): boolean {
    return this.config.sensitiveDomains.some(
      (sensitiveDomain) =>
        domain === sensitiveDomain ||
        domain.endsWith(`.${sensitiveDomain}`),
    );
  }
}

/**
 * 애플리케이션 공통 Privacy Protector
 */
export const privacyProtector = new PrivacyProtector(privacyConfig);