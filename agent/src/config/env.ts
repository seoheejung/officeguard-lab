import { dirname, join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { isSea } from 'node:sea';

// 실행 환경별 .env 경로 구성
const envFilePath = isSea()
  ? join(dirname(process.execPath), '.env')
  : join(process.cwd(), '.env');

try {
  // Agent 환경 변수 파일 로드
  loadEnvFile(envFilePath);
} catch (error) {
  throw new Error(
    `[agent-config] .env file load failed. path=${envFilePath}`,
    { cause: error },
  );
}

/**
 * 필수 환경 변수 값 조회
 */
export const getRequiredEnv = (name: string): string => {
  const value = process.env[name];

  if (value === undefined || value.trim() === '') {
    throw new Error(`[agent-config] ${name} is required`);
  }

  return value.trim();
};

/**
 * 선택 환경 변수 값 조회
 */
export const getOptionalEnv = (name: string): string | undefined => {
  const value = process.env[name];

  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  return value.trim();
};