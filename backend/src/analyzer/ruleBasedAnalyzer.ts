import { randomUUID } from 'node:crypto';

import type { AnalyzerConfig } from '../config/analyzerConfig.js';
import type {
  DnsQueryEvent,
  FileCopiedEvent,
  RuleHitEvent,
  SecurityEvent,
  UsbConnectedEvent,
} from '../events/index.js';
import {
  detectionRules,
  type DetectionRule,
} from './detectionRules.js';

interface StoredUsbEvent {
  event: UsbConnectedEvent;
  timestampMs: number;
}

interface StoredFileCopiedEvent {
  event: FileCopiedEvent;
  timestampMs: number;
}

interface DnsEventReference {
  eventId: string;
  timestampMs: number;
}

/**
 * 도메인 비교 형식 정규화
 */
const normalizeDomain = (domain: string): string =>
  domain.trim().toLowerCase().replace(/\.$/, '');

/**
 * 초 단위 값을 밀리초로 변환
 */
const secondsToMilliseconds = (seconds: number): number =>
  seconds * 1_000;

/**
 * SecurityEvent 기반 Rule 평가와 RULE_HIT 생성
 */
export class RuleBasedAnalyzer {
  private recentUsbEvents: StoredUsbEvent[] = [];

  private recentFileCopiedEvents: StoredFileCopiedEvent[] = [];

  private readonly dnsEventsBySourceIp = new Map<
    string,
    DnsEventReference[]
  >();

  private readonly lastDnsSpikeHitAtBySourceIp = new Map<
    string,
    number
  >();

  public constructor(
    private readonly config: Readonly<AnalyzerConfig>,
  ) {}

  /**
   * SecurityEvent Rule 평가
   */
  public analyze(event: SecurityEvent): RuleHitEvent[] {
    // RULE_HIT 재분석 방지
    if (event.eventType === 'RULE_HIT') {
      return [];
    }

    const timestampMs = Date.parse(event.timestamp);

    if (Number.isNaN(timestampMs)) {
      console.error(
        `[analyzer] invalid timestamp. eventType=${event.eventType} eventId=${event.eventId} timestamp=${event.timestamp}`,
      );

      return [];
    }

    // 탐지 시간 범위를 벗어난 상태 제거
    this.removeExpiredEvents(timestampMs);

    switch (event.eventType) {
      case 'USB_CONNECTED':
        this.storeUsbEvent(event, timestampMs);
        return [];

      case 'FILE_COPIED':
        return this.analyzeFileCopied(event, timestampMs);

      case 'DNS_QUERY':
        return this.analyzeDnsQuery(event, timestampMs);

      default:
        return [];
    }
  }

  /**
   * USB 연결 이벤트 저장
   */
  private storeUsbEvent(
    event: UsbConnectedEvent,
    timestampMs: number,
  ): void {
    this.recentUsbEvents.push({
      event,
      timestampMs,
    });
  }

  /**
   * 파일 복사 이벤트 Rule 평가
   */
  private analyzeFileCopied(
    event: FileCopiedEvent,
    timestampMs: number,
  ): RuleHitEvent[] {
    const ruleHits: RuleHitEvent[] = [];

    // 대용량 파일 복사 탐지
    const largeFileCopyRuleHit =
      this.checkLargeFileCopy(event);

    if (largeFileCopyRuleHit !== undefined) {
      ruleHits.push(largeFileCopyRuleHit);
    }

    // USB 연결 후 파일 복사 탐지
    const usbFileCopyRuleHit =
      this.checkUsbFileCopy(event, timestampMs);

    if (usbFileCopyRuleHit !== undefined) {
      ruleHits.push(usbFileCopyRuleHit);
    }

    // 외부 도메인 연속 탐지를 위한 파일 복사 이벤트 저장
    this.recentFileCopiedEvents.push({
      event,
      timestampMs,
    });

    return ruleHits;
  }

  /**
   * 대용량 파일 복사 Rule 평가
   */
  private checkLargeFileCopy(
    event: FileCopiedEvent,
  ): RuleHitEvent | undefined {
    if (!detectionRules.largeFileCopy.enabled) {
      return undefined;
    }

    const sizeBytes = event.metadata.sizeBytes;

    if (sizeBytes === undefined) {
      return undefined;
    }

    if (
      sizeBytes <
      this.config.largeFileCopyBytesThreshold
    ) {
      return undefined;
    }

    return this.createRuleHit(
      detectionRules.largeFileCopy,
      event,
      '파일 복사 크기가 설정된 탐지 임계값 이상입니다.',
      [event.eventId],
    );
  }

  /**
   * USB 연결 후 파일 복사 Rule 평가
   */
  private checkUsbFileCopy(
    fileCopiedEvent: FileCopiedEvent,
    fileCopiedTimestampMs: number,
  ): RuleHitEvent | undefined {
    if (!detectionRules.usbFileCopy.enabled) {
      return undefined;
    }

    const usbEventIndex = this.findRecentUsbEventIndex(
      fileCopiedEvent,
      fileCopiedTimestampMs,
    );

    if (usbEventIndex === -1) {
      return undefined;
    }

    // 동일 USB 이벤트의 반복 탐지 방지를 위한 상태 제거
    const [storedUsbEvent] =
      this.recentUsbEvents.splice(usbEventIndex, 1);

    if (storedUsbEvent === undefined) {
      return undefined;
    }

    return this.createRuleHit(
      detectionRules.usbFileCopy,
      fileCopiedEvent,
      'USB 연결 후 설정된 시간 범위 안에 파일 복사가 발생했습니다.',
      [
        storedUsbEvent.event.eventId,
        fileCopiedEvent.eventId,
      ],
      this.config.usbFileCopyWindowSeconds,
    );
  }

  /**
   * 최근 USB 연결 이벤트 검색
   */
  private findRecentUsbEventIndex(
    fileCopiedEvent: FileCopiedEvent,
    fileCopiedTimestampMs: number,
  ): number {
    for (
      let index = this.recentUsbEvents.length - 1;
      index >= 0;
      index -= 1
    ) {
      const storedUsbEvent = this.recentUsbEvents[index];

      if (storedUsbEvent === undefined) {
        continue;
      }

      const sameSubject = this.isSameEventSubject(
        storedUsbEvent.event,
        fileCopiedEvent,
      );

      if (!sameSubject) {
        continue;
      }

      const withinWindow = this.isWithinWindow(
        storedUsbEvent.timestampMs,
        fileCopiedTimestampMs,
        this.config.usbFileCopyWindowSeconds,
      );

      if (withinWindow) {
        return index;
      }
    }

    return -1;
  }

  /**
   * DNS Query 이벤트 Rule 평가
   */
  private analyzeDnsQuery(
    event: DnsQueryEvent,
    timestampMs: number,
  ): RuleHitEvent[] {
    const ruleHits: RuleHitEvent[] = [];

    // 파일 복사 후 외부 도메인 조회 탐지
    const externalDomainRuleHit =
      this.checkFileCopyExternalDomain(
        event,
        timestampMs,
      );

    if (externalDomainRuleHit !== undefined) {
      ruleHits.push(externalDomainRuleHit);
    }

    // DNS 요청량 급증 탐지
    const dnsSpikeRuleHit = this.checkDnsSpike(
      event,
      timestampMs,
    );

    if (dnsSpikeRuleHit !== undefined) {
      ruleHits.push(dnsSpikeRuleHit);
    }

    return ruleHits;
  }

  /**
   * 파일 복사 후 외부 도메인 조회 Rule 평가
   */
  private checkFileCopyExternalDomain(
    dnsEvent: DnsQueryEvent,
    dnsTimestampMs: number,
  ): RuleHitEvent | undefined {
    if (
      !detectionRules.fileCopyExternalDomain.enabled
    ) {
      return undefined;
    }

    const externalDomain =
      this.isConfiguredExternalDomain(
        dnsEvent.metadata.domain,
      );

    if (!externalDomain) {
      return undefined;
    }

    const fileCopiedEventIndex =
      this.findRecentFileCopiedEventIndex(
        dnsEvent,
        dnsTimestampMs,
      );

    if (fileCopiedEventIndex === -1) {
      return undefined;
    }

    // 동일 파일 복사 이벤트의 반복 탐지 방지를 위한 상태 제거
    const [storedFileCopiedEvent] =
      this.recentFileCopiedEvents.splice(
        fileCopiedEventIndex,
        1,
      );

    if (storedFileCopiedEvent === undefined) {
      return undefined;
    }

    return this.createRuleHit(
      detectionRules.fileCopyExternalDomain,
      dnsEvent,
      '파일 복사 후 설정된 시간 범위 안에 외부 전송 대상 도메인 조회가 발생했습니다.',
      [
        storedFileCopiedEvent.event.eventId,
        dnsEvent.eventId,
      ],
      this.config
        .fileCopyExternalDomainWindowSeconds,
    );
  }

  /**
   * 최근 파일 복사 이벤트 검색
   */
  private findRecentFileCopiedEventIndex(
    dnsEvent: DnsQueryEvent,
    dnsTimestampMs: number,
  ): number {
    for (
      let index =
        this.recentFileCopiedEvents.length - 1;
      index >= 0;
      index -= 1
    ) {
      const storedFileCopiedEvent =
        this.recentFileCopiedEvents[index];

      if (storedFileCopiedEvent === undefined) {
        continue;
      }

      const sameSubject = this.isSameEventSubject(
        storedFileCopiedEvent.event,
        dnsEvent,
      );

      if (!sameSubject) {
        continue;
      }

      const withinWindow = this.isWithinWindow(
        storedFileCopiedEvent.timestampMs,
        dnsTimestampMs,
        this.config
          .fileCopyExternalDomainWindowSeconds,
      );

      if (withinWindow) {
        return index;
      }
    }

    return -1;
  }

  /**
   * DNS 요청량 급증 Rule 평가
   */
  private checkDnsSpike(
    event: DnsQueryEvent,
    timestampMs: number,
  ): RuleHitEvent | undefined {
    if (!detectionRules.dnsQuerySpike.enabled) {
      return undefined;
    }

    const dnsEvents = this.storeDnsEvent(
      event,
      timestampMs,
    );

    if (
      dnsEvents.length <
      this.config.dnsSpikeThreshold
    ) {
      return undefined;
    }

    const duplicateHit = this.isDnsSpikeCooldownActive(
      event.sourceIp,
      timestampMs,
    );

    if (duplicateHit) {
      return undefined;
    }

    // sourceIp별 마지막 DNS Spike 탐지 시각 저장
    this.lastDnsSpikeHitAtBySourceIp.set(
      event.sourceIp,
      timestampMs,
    );

    const relatedEventIds = dnsEvents.map(
      (dnsEvent) => dnsEvent.eventId,
    );

    return this.createRuleHit(
      detectionRules.dnsQuerySpike,
      event,
      '동일한 sourceIp에서 설정된 시간 범위 안에 DNS 요청량이 임계값 이상 발생했습니다.',
      relatedEventIds,
      this.config.dnsSpikeWindowSeconds,
    );
  }

  /**
   * sourceIp별 DNS 이벤트 저장
   */
  private storeDnsEvent(
    event: DnsQueryEvent,
    timestampMs: number,
  ): DnsEventReference[] {
    const windowMilliseconds =
      secondsToMilliseconds(
        this.config.dnsSpikeWindowSeconds,
      );

    const windowStartTimestamp =
      timestampMs - windowMilliseconds;

    const existingEvents =
      this.dnsEventsBySourceIp.get(event.sourceIp) ??
      [];

    // 현재 이벤트 시간 범위 안의 DNS 이벤트만 유지
    const activeEvents = existingEvents.filter(
      (dnsEvent) =>
        dnsEvent.timestampMs >= windowStartTimestamp &&
        dnsEvent.timestampMs <= timestampMs,
    );

    // 동일 eventId 중복 저장 방지
    const alreadyStored = activeEvents.some(
      (dnsEvent) =>
        dnsEvent.eventId === event.eventId,
    );

    if (!alreadyStored) {
      activeEvents.push({
        eventId: event.eventId,
        timestampMs,
      });
    }

    this.dnsEventsBySourceIp.set(
      event.sourceIp,
      activeEvents,
    );

    return activeEvents;
  }

  /**
   * DNS Spike 중복 탐지 제한 확인
   */
  private isDnsSpikeCooldownActive(
    sourceIp: string,
    timestampMs: number,
  ): boolean {
    const lastRuleHitTimestamp =
      this.lastDnsSpikeHitAtBySourceIp.get(sourceIp);

    if (lastRuleHitTimestamp === undefined) {
      return false;
    }

    const cooldownMilliseconds =
      secondsToMilliseconds(
        this.config.dnsSpikeWindowSeconds,
      );

    const elapsedMilliseconds =
      timestampMs - lastRuleHitTimestamp;

    return elapsedMilliseconds < cooldownMilliseconds;
  }

  /**
   * 두 이벤트의 동일 대상 여부 확인
   */
  private isSameEventSubject(
    firstEvent: SecurityEvent,
    secondEvent: SecurityEvent,
  ): boolean {
    const sameDevice =
      firstEvent.deviceId !== undefined &&
      secondEvent.deviceId !== undefined &&
      firstEvent.deviceId === secondEvent.deviceId;

    if (sameDevice) {
      return true;
    }

    const sameSourceIp =
      firstEvent.sourceIp !== undefined &&
      secondEvent.sourceIp !== undefined &&
      firstEvent.sourceIp === secondEvent.sourceIp;

    return sameSourceIp;
  }

  /**
   * 선행 이벤트와 후속 이벤트의 시간 범위 확인
   */
  private isWithinWindow(
    previousTimestampMs: number,
    currentTimestampMs: number,
    windowSeconds: number,
  ): boolean {
    const elapsedMilliseconds =
      currentTimestampMs - previousTimestampMs;

    if (elapsedMilliseconds < 0) {
      return false;
    }

    const windowMilliseconds =
      secondsToMilliseconds(windowSeconds);

    return elapsedMilliseconds <= windowMilliseconds;
  }

  /**
   * 외부 전송 대상 도메인 여부 확인
   */
  private isConfiguredExternalDomain(
    domain: string,
  ): boolean {
    const normalizedDomain = normalizeDomain(domain);

    return this.config.externalDomains.some(
      (configuredDomain) => {
        if (normalizedDomain === configuredDomain) {
          return true;
        }

        return normalizedDomain.endsWith(
          `.${configuredDomain}`,
        );
      },
    );
  }

  /**
   * RULE_HIT 이벤트 생성
   */
  private createRuleHit(
    rule: DetectionRule,
    triggerEvent: SecurityEvent,
    message: string,
    relatedEventIds: string[],
    windowSeconds?: number,
  ): RuleHitEvent {
    const ruleHit: RuleHitEvent = {
      eventId: randomUUID(),
      eventType: 'RULE_HIT',
      timestamp: new Date().toISOString(),
      severity: rule.severity,
      message,
      metadata: {
        ruleId: rule.ruleId,
        relatedEventIds,
      },
    };

    // 탐지 대상 sourceIp 복사
    if (triggerEvent.sourceIp !== undefined) {
      ruleHit.sourceIp = triggerEvent.sourceIp;
    }

    // 탐지 대상 deviceId 복사
    if (triggerEvent.deviceId !== undefined) {
      ruleHit.deviceId = triggerEvent.deviceId;
    }

    // 탐지 대상 사용자 별칭 복사
    if (triggerEvent.userAlias !== undefined) {
      ruleHit.userAlias = triggerEvent.userAlias;
    }

    // 연속 및 집계 Rule의 탐지 시간 범위 기록
    if (windowSeconds !== undefined) {
      ruleHit.metadata.windowSeconds = windowSeconds;
    }

    return ruleHit;
  }

  /**
   * 탐지 시간 범위를 벗어난 상태 제거
   */
  private removeExpiredEvents(
    currentTimestampMs: number,
  ): void {
    this.removeExpiredUsbEvents(currentTimestampMs);

    this.removeExpiredFileCopiedEvents(
      currentTimestampMs,
    );

    this.removeExpiredDnsEvents(currentTimestampMs);

    this.removeExpiredDnsSpikeCooldowns(
      currentTimestampMs,
    );
  }

  /**
   * 만료된 USB 연결 이벤트 제거
   */
  private removeExpiredUsbEvents(
    currentTimestampMs: number,
  ): void {
    const windowMilliseconds =
      secondsToMilliseconds(
        this.config.usbFileCopyWindowSeconds,
      );

    const windowStartTimestamp =
      currentTimestampMs - windowMilliseconds;

    this.recentUsbEvents =
      this.recentUsbEvents.filter(
        (storedEvent) =>
          storedEvent.timestampMs >=
          windowStartTimestamp,
      );
  }

  /**
   * 만료된 파일 복사 이벤트 제거
   */
  private removeExpiredFileCopiedEvents(
    currentTimestampMs: number,
  ): void {
    const windowMilliseconds =
      secondsToMilliseconds(
        this.config
          .fileCopyExternalDomainWindowSeconds,
      );

    const windowStartTimestamp =
      currentTimestampMs - windowMilliseconds;

    this.recentFileCopiedEvents =
      this.recentFileCopiedEvents.filter(
        (storedEvent) =>
          storedEvent.timestampMs >=
          windowStartTimestamp,
      );
  }

  /**
   * 만료된 DNS 이벤트 제거
   */
  private removeExpiredDnsEvents(
    currentTimestampMs: number,
  ): void {
    const windowMilliseconds =
      secondsToMilliseconds(
        this.config.dnsSpikeWindowSeconds,
      );

    const windowStartTimestamp =
      currentTimestampMs - windowMilliseconds;

    for (const [
      sourceIp,
      dnsEvents,
    ] of this.dnsEventsBySourceIp) {
      const activeEvents = dnsEvents.filter(
        (dnsEvent) =>
          dnsEvent.timestampMs >=
          windowStartTimestamp,
      );

      if (activeEvents.length === 0) {
        this.dnsEventsBySourceIp.delete(sourceIp);
        continue;
      }

      this.dnsEventsBySourceIp.set(
        sourceIp,
        activeEvents,
      );
    }
  }

  /**
   * 만료된 DNS Spike 중복 제한 상태 제거
   */
  private removeExpiredDnsSpikeCooldowns(
    currentTimestampMs: number,
  ): void {
    const cooldownMilliseconds =
      secondsToMilliseconds(
        this.config.dnsSpikeWindowSeconds,
      );

    for (const [
      sourceIp,
      lastRuleHitTimestamp,
    ] of this.lastDnsSpikeHitAtBySourceIp) {
      const elapsedMilliseconds =
        currentTimestampMs - lastRuleHitTimestamp;

      if (elapsedMilliseconds >= cooldownMilliseconds) {
        this.lastDnsSpikeHitAtBySourceIp.delete(
          sourceIp,
        );
      }
    }
  }
}