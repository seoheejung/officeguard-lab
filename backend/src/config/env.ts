/**
 * 필수 환경 변수 값 조회
 */
export const getRequiredEnv = (name: string): string => {
  const value = process.env[name];

  if (value === undefined || value.trim() === '') {
    throw new Error(`[config] ${name} is required`);
  }

  return value.trim();
};