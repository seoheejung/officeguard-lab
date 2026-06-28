import { statSync, type Stats } from 'node:fs';
import { isIP } from 'node:net';
import { isAbsolute } from 'node:path';

import { getOptionalEnv, getRequiredEnv } from './env.js';

/**
 * 검증 완료 Event Receiver 설정
 */
interface ReceiverConfig {
  url: string;
  destinationIp: string;
  destinationPort: number;
}

/**
 * 최소값 이상 정수 환경 변수 변환
 */
const parseSafeIntegerAtLeast = (
  name: string,
  value: string,
  minimum: number,
): number => {
  const parsedValue = Number(value);

  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < minimum
  ) {
    throw new Error(
      `[agent-config] ${name} must be a safe integer greater than or equal to ${minimum}. received=${value}`,
    );
  }

  return parsedValue;
};

/**
 * 양의 정수 환경 변수 변환
 */
const parsePositiveSafeInteger = (
  name: string,
  value: string,
): number => parseSafeIntegerAtLeast(name, value, 1);

/**
 * Event Receiver URL 검증
 */
const parseReceiverConfig = (value: string): ReceiverConfig => {
  let url: URL;

  try {
    // 환경 변수 문자열의 URL 객체 변환
    url = new URL(value);
  } catch {
    throw new Error(
      `[agent-config] AGENT_RECEIVER_URL must be a valid URL. received=${value}`,
    );
  }

  // 내부망 HTTP Receiver 프로토콜 제한
  if (url.protocol !== 'http:') {
    throw new Error(
      `[agent-config] AGENT_RECEIVER_URL protocol must be http. received=${url.protocol}`,
    );
  }

  // Receiver Host의 IP 주소 형식 검증
  if (isIP(url.hostname) === 0) {
    throw new Error(
      `[agent-config] AGENT_RECEIVER_URL hostname must be an IP address. received=${url.hostname}`,
    );
  }

  // 명시적 Receiver Port 확인
  if (url.port === '') {
    throw new Error(
      '[agent-config] AGENT_RECEIVER_URL must include an explicit port',
    );
  }

  const destinationPort = Number(url.port);

  // TCP Port 범위 검증
  if (
    !Number.isInteger(destinationPort) ||
    destinationPort < 1 ||
    destinationPort > 65_535
  ) {
    throw new Error(
      `[agent-config] AGENT_RECEIVER_URL port is invalid. received=${url.port}`,
    );
  }

  return {
    url: url.toString(),
    destinationIp: url.hostname,
    destinationPort,
  };
};

/**
 * 파일 감시 경로 상태 조회
 */
const getFileWatchPathStat = (value: string): Stats => {
  try {
    return statSync(value);
  } catch {
    throw new Error(
      `[agent-config] AGENT_FILE_WATCH_PATH does not exist. received=${value}`,
    );
  }
};

/**
 * 파일 감시 경로 검증
 */
const parseFileWatchPath = (value: string): string => {
  // Windows 절대 경로 여부 확인
  if (!isAbsolute(value)) {
    throw new Error(
      `[agent-config] AGENT_FILE_WATCH_PATH must be an absolute path. received=${value}`,
    );
  }

  const pathStat = getFileWatchPathStat(value);

  // 파일 경로가 아닌 디렉터리 경로 확인
  if (!pathStat.isDirectory()) {
    throw new Error(
      `[agent-config] AGENT_FILE_WATCH_PATH must be a directory. received=${value}`,
    );
  }

  return value;
};

// Event Receiver URL 분석 및 연결 대상 추출
const receiverConfig = parseReceiverConfig(
  getRequiredEnv('AGENT_RECEIVER_URL'),
);

/**
 * Mini PC Agent 실행 설정
 */
export const agentConfig = {
  receiverUrl: receiverConfig.url,
  receiverDestinationIp: receiverConfig.destinationIp,
  receiverDestinationPort: receiverConfig.destinationPort,
  deviceId: getRequiredEnv('AGENT_DEVICE_ID'),
  userAlias: getOptionalEnv('AGENT_USER_ALIAS'),
  networkInterface: getRequiredEnv(
    'AGENT_NETWORK_INTERFACE',
  ),
  requestTimeoutMs: parsePositiveSafeInteger(
    'AGENT_REQUEST_TIMEOUT_MS',
    getRequiredEnv('AGENT_REQUEST_TIMEOUT_MS'),
  ),
  fileWatchPath: parseFileWatchPath(
    getRequiredEnv('AGENT_FILE_WATCH_PATH'),
  ),
  fileEventDebounceMs: parsePositiveSafeInteger(
    'AGENT_FILE_EVENT_DEBOUNCE_MS',
    getRequiredEnv('AGENT_FILE_EVENT_DEBOUNCE_MS'),
  ),
  usbCopySettleIntervalMs: parsePositiveSafeInteger(
    'AGENT_USB_COPY_SETTLE_INTERVAL_MS',
    getRequiredEnv('AGENT_USB_COPY_SETTLE_INTERVAL_MS'),
  ),
  usbCopySettleMaxAttempts: parseSafeIntegerAtLeast(
    'AGENT_USB_COPY_SETTLE_MAX_ATTEMPTS',
    getRequiredEnv('AGENT_USB_COPY_SETTLE_MAX_ATTEMPTS'),
    3,
  ),
} as const;