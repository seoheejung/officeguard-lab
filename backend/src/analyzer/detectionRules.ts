import type { SecuritySeverity } from '../events/index.js';

export interface DetectionRule {
  ruleId: string;
  name: string;
  description: string;
  severity: SecuritySeverity;
  enabled: boolean;
}

/**
 * 탐지 Rule 정의
 */
export const detectionRules = {
  largeFileCopy: {
    ruleId: 'LARGE_FILE_COPY_DETECTED',
    name: '대용량 파일 복사 탐지',
    description:
      '파일 복사 크기가 설정한 임계값 이상인 이벤트 탐지',
    severity: 'MEDIUM',
    enabled: true,
  },
  usbFileCopy: {
    ruleId: 'USB_FILE_COPY_DETECTED',
    name: 'USB 연결 후 파일 복사 탐지',
    description:
      'USB 연결 후 설정된 시간 범위 안에 발생한 파일 복사 탐지',
    severity: 'HIGH',
    enabled: true,
  },
  fileCopyExternalDomain: {
    ruleId: 'FILE_COPY_EXTERNAL_DOMAIN_DETECTED',
    name: '파일 복사 후 외부 도메인 조회 탐지',
    description:
      '파일 복사 후 설정된 외부 전송 대상 도메인 DNS 조회 탐지',
    severity: 'HIGH',
    enabled: true,
  },
  dnsQuerySpike: {
    ruleId: 'DNS_QUERY_SPIKE_DETECTED',
    name: 'DNS 요청량 급증 탐지',
    description:
      '동일한 sourceIp에서 설정된 시간 범위 안에 발생한 DNS 요청량 급증 탐지',
    severity: 'MEDIUM',
    enabled: true,
  },
} as const satisfies Record<string, DetectionRule>;