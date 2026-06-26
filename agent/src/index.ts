import {
  startWindowsDnsCollector,
  type WindowsDnsCollector,
} from './collectors/windowsDnsCollector.js';
import { agentConfig } from './config/agentConfig.js';
import { createDnsQueryEvent } from './events/dnsQueryEvent.js';
import { resolveSourceIp } from './network/sourceIp.js';
import { sendDnsQueryEvent } from './sender/eventSender.js';

/**
 * Mini PC Agent 실행
 */
const startAgent = async (): Promise<void> => {
  // Windows 실행 환경 검증
  if (process.platform !== 'win32') {
    throw new Error('[agent] Windows platform is required');
  }

  // 지정 Network Interface의 sourceIp 조회
  const sourceIp = resolveSourceIp(agentConfig.networkInterface);

  console.log('[agent] OfficeGuard Mini PC Agent starting');
  console.log(`[agent] deviceId=${agentConfig.deviceId}`);
  console.log(`[agent] sourceIp=${sourceIp}`);
  console.log(`[agent] networkInterface=${agentConfig.networkInterface}`);

  let collector: WindowsDnsCollector | undefined;
  let sendQueue: Promise<void> = Promise.resolve();
  let shuttingDown = false;

  /**
   * Agent 종료 처리
   */
  const shutdown = async (signal: string, exitCode: number): Promise<void> => {
    // 중복 종료 요청 차단
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    console.log(`[agent] shutdown requested. signal=${signal}`);

    // DNS Event 수집 중지
    collector?.stop();

    // 진행 중인 이벤트 전송 완료 대기
    await sendQueue;

    console.log('[agent] stopped');

    process.exit(exitCode);
  };

  // DNS Event 수집 시작
  collector = startWindowsDnsCollector({
    onRecord: (record) => {
      // 선택 사용자 별칭을 포함한 이벤트 생성 정보 구성
      const eventContext =
        agentConfig.userAlias === undefined
          ? {
              sourceIp,
              deviceId: agentConfig.deviceId,
            }
          : {
              sourceIp,
              deviceId: agentConfig.deviceId,
              userAlias: agentConfig.userAlias,
            };

      // Windows DNS 기록의 DNS_QUERY 변환
      const event = createDnsQueryEvent(record, eventContext);

      // 변환할 수 없는 DNS 기록 제외
      if (event === undefined) {
        console.error(
          `[agent] invalid DNS record skipped. recordId=${record.recordId}`,
        );

        return;
      }

      console.log(
        `[agent] DNS_QUERY collected. domain=${event.metadata.domain} queryType=${event.metadata.queryType} eventId=${event.eventId}`,
      );

      // DNS_QUERY 순차 전송
      sendQueue = sendQueue
        .then(async () => {
          await sendDnsQueryEvent(event, {
            receiverUrl: agentConfig.receiverUrl,
            requestTimeoutMs: agentConfig.requestTimeoutMs,
          });

          console.log(`[agent] DNS_QUERY sent. eventId=${event.eventId}`);
        })
        .catch((error: unknown) => {
          console.error(
            `[agent] DNS_QUERY send failed. eventId=${event.eventId}`,
            error,
          );
        });
    },

    // DNS Collector 치명적 오류 처리
    onFatalError: (error) => {
      console.error('[agent] DNS collector failed:', error);
      void shutdown('collector-error', 1);
    },
  });

  // Ctrl+C 종료 처리
  process.once('SIGINT', () => {
    void shutdown('SIGINT', 0);
  });

  // 외부 종료 신호 처리
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM', 0);
  });

  console.log('[agent] running. press Ctrl+C to stop');
};

// Agent 초기화 실패 처리
void startAgent().catch((error: unknown) => {
  console.error('[agent] failed to start:', error);
  process.exit(1);
});