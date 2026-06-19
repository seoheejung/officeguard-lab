const DEFAULT_PORT = 4000;
const SERVICE_NAME = 'officeguard-lab-backend';
const DEFAULT_NODE_ENV = 'development';

/**
 * PORT 환경 변수를 서버에서 사용할 수 있는 포트 번호로 변환
 *
 * 환경 변수가 없으면 기본 포트 4000을 사용
 */
const parsePort = (value: string | undefined): number => {
  if (value === undefined) {
    return DEFAULT_PORT;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `[config] PORT must be an integer between 1 and 65535. received=${value}`,
    );
  }

  return port;
};

export const serverConfig = {
  port: parsePort(process.env.PORT),
  serviceName: SERVICE_NAME,
  nodeEnv: process.env.NODE_ENV ?? DEFAULT_NODE_ENV,
} as const;