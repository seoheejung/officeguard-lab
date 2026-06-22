const SERVICE_NAME = 'officeguard-lab-backend';

type NodeEnvironment = 'development' | 'test' | 'production';

/**
 * 필수 환경 변수 값 조회
 */
const getRequiredEnv = (name: string): string => {
  const value = process.env[name];

  if (value === undefined || value.trim() === '') {
    throw new Error(`[config] ${name} is required`);
  }

  return value.trim();
};

/**
 * PORT 환경 변수를 서버에서 사용할 포트 번호로 변환
 */
const parsePort = (value: string): number => {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `[config] PORT must be an integer between 1 and 65535. received=${value}`,
    );
  }

  return port;
};

/**
 * NODE_ENV 환경 변수 값 검증
 */
const parseNodeEnvironment = (value: string): NodeEnvironment => {
  if (
    value !== 'development' &&
    value !== 'test' &&
    value !== 'production'
  ) {
    throw new Error(
      `[config] NODE_ENV must be development, test, or production. received=${value}`,
    );
  }

  return value;
};

export const serverConfig = {
  port: parsePort(getRequiredEnv('PORT')),
  serviceName: SERVICE_NAME,
  nodeEnv: parseNodeEnvironment(getRequiredEnv('NODE_ENV')),
} as const;
