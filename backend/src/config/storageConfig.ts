import { getRequiredEnv } from './env.js';

/**
 * PostgreSQL 포트 번호 변환
 */
const parsePostgresPort = (value: string): number => {
  const port = Number(value);

  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535
  ) {
    throw new Error(
      `[config] POSTGRES_PORT must be an integer between 1 and 65535. received=${value}`,
    );
  }

  return port;
};

/**
 * PostgreSQL 연결 설정
 */
export const storageConfig = {
  host: getRequiredEnv('POSTGRES_HOST'),
  port: parsePostgresPort(
    getRequiredEnv('POSTGRES_PORT'),
  ),
  database: getRequiredEnv('POSTGRES_DB'),
  user: getRequiredEnv('POSTGRES_USER'),
  password: getRequiredEnv('POSTGRES_PASSWORD'),
} as const;