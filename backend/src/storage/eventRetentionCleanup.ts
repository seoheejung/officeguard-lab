import { deleteExpiredSecurityEvents } from './securityEventRepository.js';

/**
 * 설정된 보관 기간을 초과한 이벤트 정리
 */
export const runEventRetentionCleanup = async (
  retentionDays: number,
): Promise<void> => {
  const deletedCount =
    await deleteExpiredSecurityEvents(retentionDays);

  console.log( `[retention] cleanup completed. retentionDays=${retentionDays} deleted=${deletedCount}` );
};

/**
 * 설정된 주기에 따른 만료 이벤트 반복 정리
 */
export const startEventRetentionCleanup = (
  retentionDays: number,
  intervalMs: number,
): NodeJS.Timeout => {
  // 이전 정리 작업의 실행 상태 관리
  let cleanupRunning = false;

  const timer = setInterval(() => {
    // 이전 정리 작업과의 중복 실행 방지
    if (cleanupRunning) {
      console.warn( '[retention] cleanup skipped. previous cleanup still running' );
      return;
    }

    cleanupRunning = true;

    void runEventRetentionCleanup(retentionDays)
      .catch((error: unknown) => {
        console.error( '[retention] cleanup failed:', error );
      })
      .finally(() => {
        cleanupRunning = false;
      });
  }, intervalMs);

  // 정리 Timer만 남은 경우 Node.js 프로세스 자동 종료 허용
  timer.unref();

  console.log( `[retention] cleanup scheduled. retentionDays=${retentionDays} intervalMs=${intervalMs}` );

  return timer;
};