import { isIP } from 'node:net';

import { getOptionalEnv, getRequiredEnv } from './env.js';

interface ReceiverConfig {
  url: string;
  destinationIp: string;
  destinationPort: number;
}

/**
 * 양의 정수 환경 변수 변환
 */
const parsePositiveSafeInteger = (
  name: string,
  value: string,
): number => {
  const parsedValue = Number(value);

  if (!Number.isSafeInteger(parsedValue) || parsedValue < 1) {
    throw new Error( `[agent-config] ${name} must be a positive safe integer. received=${value}` );
  }

  return parsedValue;
};

/**
 * Event Receiver URL과 목적지 정보 검증
 */
const parseReceiverConfig = (value: string): ReceiverConfig => {
  const url = new URL(value);

  // HTTP 또는 HTTPS Protocol 제한
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error( `[agent-config] AGENT_RECEIVER_URL must use http or https. received=${value}` );
  }

  // URL 인증 정보 포함 차단
  if (url.username !== '' || url.password !== '') {
    throw new Error( '[agent-config] AGENT_RECEIVER_URL must not contain credentials' );
  }

  // 내부망 IPv4 직접 지정 검증
  if (isIP(url.hostname) !== 4) {
    throw new Error( `[agent-config] AGENT_RECEIVER_URL hostname must be an IPv4 address. received=${url.hostname}` );
  }

  // Receiver Port 명시 여부 검증
  if (url.port === '') {
    throw new Error( '[agent-config] AGENT_RECEIVER_URL must include an explicit port' );
  }

  // Receiver Port 변환
  const destinationPort = Number(url.port);

  // Receiver Port 범위 검증
  if ( !Number.isInteger(destinationPort) || destinationPort < 1 || destinationPort > 65_535 ) {
    throw new Error( `[agent-config] AGENT_RECEIVER_URL port is invalid. received=${url.port}` );
  }

  return {
    url: url.toString(),
    destinationIp: url.hostname,
    destinationPort,
  };
};

// Event Receiver 설정 사전 검증
const receiverConfig = parseReceiverConfig( getRequiredEnv('AGENT_RECEIVER_URL') );

/**
 * Mini PC Agent 실행 설정
 */
export const agentConfig = {
  receiverUrl: receiverConfig.url,
  receiverDestinationIp: receiverConfig.destinationIp,
  receiverDestinationPort: receiverConfig.destinationPort,
  deviceId: getRequiredEnv('AGENT_DEVICE_ID'),
  userAlias: getOptionalEnv('AGENT_USER_ALIAS'),
  networkInterface: getRequiredEnv('AGENT_NETWORK_INTERFACE'),
  requestTimeoutMs: parsePositiveSafeInteger(
    'AGENT_REQUEST_TIMEOUT_MS',
    getRequiredEnv('AGENT_REQUEST_TIMEOUT_MS'),
  ),
} as const;