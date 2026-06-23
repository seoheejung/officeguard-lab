import { getRequiredEnv } from './env.js';

export interface AnalyzerConfig {
  largeFileCopyBytesThreshold: number;
  usbFileCopyWindowSeconds: number;
  fileCopyExternalDomainWindowSeconds: number;
  dnsSpikeWindowSeconds: number;
  dnsSpikeThreshold: number;
  externalDomains: readonly string[];
}

/**
 * 환경 변수 양의 정수 변환
 */
const parsePositiveSafeInteger = (
  name: string,
  value: string,
): number => {
  const parsedValue = Number(value);

  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < 1
  ) {
    throw new Error(
      `[config] ${name} must be a positive safe integer. received=${value}`,
    );
  }

  return parsedValue;
};

/**
 * 도메인 비교 형식 정규화
 */
const normalizeDomain = (domain: string): string =>
  domain.trim().toLowerCase().replace(/\.$/, '');

/**
 * 쉼표 구분 도메인 목록 변환
 */
const parseExternalDomains = (value: string): string[] => {
  const domains = value
    .split(',')
    .map(normalizeDomain)
    .filter((domain) => domain.length > 0);

  if (domains.length === 0) {
    throw new Error(
      `[config] ANALYZER_EXTERNAL_DOMAINS must contain at least one domain. received=${value}`,
    );
  }

  return [...new Set(domains)];
};

/**
 * Rule-based Analyzer 실행 설정
 */
export const analyzerConfig: AnalyzerConfig = {
  largeFileCopyBytesThreshold: parsePositiveSafeInteger(
    'ANALYZER_LARGE_FILE_COPY_BYTES_THRESHOLD',
    getRequiredEnv(
      'ANALYZER_LARGE_FILE_COPY_BYTES_THRESHOLD',
    ),
  ),
  usbFileCopyWindowSeconds: parsePositiveSafeInteger(
    'ANALYZER_USB_FILE_COPY_WINDOW_SECONDS',
    getRequiredEnv(
      'ANALYZER_USB_FILE_COPY_WINDOW_SECONDS',
    ),
  ),
  fileCopyExternalDomainWindowSeconds:
    parsePositiveSafeInteger(
      'ANALYZER_FILE_COPY_EXTERNAL_DOMAIN_WINDOW_SECONDS',
      getRequiredEnv(
        'ANALYZER_FILE_COPY_EXTERNAL_DOMAIN_WINDOW_SECONDS',
      ),
    ),
  dnsSpikeWindowSeconds: parsePositiveSafeInteger(
    'ANALYZER_DNS_SPIKE_WINDOW_SECONDS',
    getRequiredEnv(
      'ANALYZER_DNS_SPIKE_WINDOW_SECONDS',
    ),
  ),
  dnsSpikeThreshold: parsePositiveSafeInteger(
    'ANALYZER_DNS_SPIKE_THRESHOLD',
    getRequiredEnv('ANALYZER_DNS_SPIKE_THRESHOLD'),
  ),
  externalDomains: parseExternalDomains(
    getRequiredEnv('ANALYZER_EXTERNAL_DOMAINS'),
  ),
};