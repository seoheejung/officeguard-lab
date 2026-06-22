/**
 * 필수 환경 변수 조회
 */
const getRequiredEnv = (name: string): string => {
  const value = process.env[name];

  if (value === undefined || value.trim() === '') {
    throw new Error(`[config] ${name} is required`);
  }

  return value;
};

/**
 * MOCK_EVENT_INTERVAL_MS 환경 변수 이벤트 생성 주기로 변환
 */
const parseInterval = (value: string): number => {
  const intervalMs = Number(value);

  if (!Number.isInteger(intervalMs) || intervalMs < 1) {
    throw new Error(
      `[config] MOCK_EVENT_INTERVAL_MS must be a positive integer. received=${value}`,
    );
  }

  return intervalMs;
};

/**
 * Mock Event Generator 실행 설정
 */
export const mockEventConfig = {
  intervalMs: parseInterval(
    getRequiredEnv('MOCK_EVENT_INTERVAL_MS'),
  ),
} as const;