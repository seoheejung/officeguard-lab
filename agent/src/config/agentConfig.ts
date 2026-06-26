import {
  getOptionalEnv,
  getRequiredEnv,
} from './env.js';

/**
 * 양의 정수 환경 변수 변환
 */
const parsePositiveSafeInteger = (
  name: string,
  value: string,
): number => {
  const parsedValue = Number(value);

  if ( !Number.isSafeInteger( parsedValue ) || parsedValue < 1 ) {
    throw new Error(
      `[agent-config] ${name} must be a positive safe integer. received=${value}`,
    );
  }

  return parsedValue;
};

/**
 * Event Receiver URL 검증
 */
const parseReceiverUrl = (
  value: string,
): string => {
  const url = new URL(value);

  if ( url.protocol !== 'http:' && url.protocol !== 'https:' ) {
    throw new Error(
      `[agent-config] AGENT_RECEIVER_URL must use http or https. received=${value}`,
    );
  }

  if ( url.username !== '' || url.password !== '' ) {
    throw new Error(
      '[agent-config] AGENT_RECEIVER_URL must not contain credentials',
    );
  }

  return url.toString();
};

/**
 * Mini PC Agent 실행 설정
 */
export const agentConfig = {
  receiverUrl: parseReceiverUrl(
    getRequiredEnv( 'AGENT_RECEIVER_URL' ),
  ),
  deviceId: getRequiredEnv( 'AGENT_DEVICE_ID' ),
  userAlias: getOptionalEnv( 'AGENT_USER_ALIAS' ),
  networkInterface:
    getRequiredEnv( 'AGENT_NETWORK_INTERFACE' ),
  requestTimeoutMs:
    parsePositiveSafeInteger( 'AGENT_REQUEST_TIMEOUT_MS', getRequiredEnv( 'AGENT_REQUEST_TIMEOUT_MS' )),
} as const;