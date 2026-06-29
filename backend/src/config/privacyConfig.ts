import { getRequiredEnv } from './env.js';

export interface PrivacyConfig {
  sourceIpAnonymizationEnabled: boolean;
  sourceIpAnonymizationKey: string | undefined;
  domainMaskingEnabled: boolean;
  sensitiveDomains: readonly string[];
  eventRetentionDays: number;
  retentionCleanupIntervalMs: number;
}

/**
 * Boolean 환경 변수 값 검증 및 변환
 */
const parseBoolean = (name: string, value: string): boolean => {
  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new Error( `[config] ${name} must be true or false. received=${value}` );
};

/**
 * 환경 변수 값을 양의 안전한 정수로 변환
 */
const parsePositiveSafeInteger = (
  name: string,
  value: string,
): number => {
  const parsedValue = Number(value);

  if (!Number.isSafeInteger(parsedValue) || parsedValue < 1) {
    throw new Error( `[config] ${name} must be a positive safe integer. received=${value}` );
  }

  return parsedValue;
};

/**
 * 도메인 비교 형식 정규화
 */
const normalizeDomain = (domain: string): string =>
  domain.trim().toLowerCase().replace(/\.$/, '');

/**
 * 쉼표 구분 민감 도메인 목록 변환 및 중복 제거
 */
const parseSensitiveDomains = (value: string): string[] => {
  const domains = value
    .split(',')
    .map(normalizeDomain)
    .filter((domain) => domain.length > 0);

  if (domains.length === 0) {
    throw new Error( '[config] PRIVACY_SENSITIVE_DOMAINS must contain at least one domain when domain masking is enabled' );
  }

  return [...new Set(domains)];
};

/**
 * Source IP 익명화 Key 최소 길이 검증
 */
const parseAnonymizationKey = (value: string): string => {
  if (value.length < 32) {
    throw new Error( '[config] PRIVACY_SOURCE_IP_ANONYMIZATION_KEY must contain at least 32 characters' );
  }

  return value;
};

// Source IP 익명화 활성화 여부
const sourceIpAnonymizationEnabled = parseBoolean(
  'PRIVACY_SOURCE_IP_ANONYMIZATION_ENABLED',
  getRequiredEnv('PRIVACY_SOURCE_IP_ANONYMIZATION_ENABLED'),
);

// 민감 도메인 마스킹 활성화 여부
const domainMaskingEnabled = parseBoolean(
  'PRIVACY_DOMAIN_MASKING_ENABLED',
  getRequiredEnv('PRIVACY_DOMAIN_MASKING_ENABLED'),
);

/**
 * 개인정보 보호 설정
 */
export const privacyConfig: PrivacyConfig = {
  sourceIpAnonymizationEnabled,

  // Source IP 익명화 활성화 시에만 Key 필수 검증
  sourceIpAnonymizationKey: sourceIpAnonymizationEnabled
    ? parseAnonymizationKey(
        getRequiredEnv('PRIVACY_SOURCE_IP_ANONYMIZATION_KEY'),
      )
    : undefined,

  domainMaskingEnabled,

  // 도메인 마스킹 활성화 시에만 민감 도메인 목록 필수 검증
  sensitiveDomains: domainMaskingEnabled
    ? parseSensitiveDomains(
        getRequiredEnv('PRIVACY_SENSITIVE_DOMAINS'),
      )
    : [],

  eventRetentionDays: parsePositiveSafeInteger(
    'PRIVACY_EVENT_RETENTION_DAYS',
    getRequiredEnv('PRIVACY_EVENT_RETENTION_DAYS'),
  ),

  retentionCleanupIntervalMs: parsePositiveSafeInteger(
    'PRIVACY_RETENTION_CLEANUP_INTERVAL_MS',
    getRequiredEnv('PRIVACY_RETENTION_CLEANUP_INTERVAL_MS'),
  ),
};