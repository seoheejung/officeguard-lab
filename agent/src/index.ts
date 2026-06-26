import {
  startWindowsDnsCollector,
  type WindowsDnsCollector,
} from './collectors/windowsDnsCollector.js';
import {
  startWindowsNetworkFlowCollector,
  type WindowsNetworkFlowCollector,
} from './collectors/windowsNetworkFlowCollector.js';
import { agentConfig } from './config/agentConfig.js';
import {
  createDnsQueryEvent,
  type DnsQueryEvent,
} from './events/dnsQueryEvent.js';
import {
  createNetworkFlowEvent,
  type NetworkFlowEvent,
} from './events/networkFlowEvent.js';
import { resolveSourceIp } from './network/sourceIp.js';
import { sendSecurityEvent } from './sender/eventSender.js';

type AgentSecurityEvent = DnsQueryEvent | NetworkFlowEvent;

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

  // Agent 실행 설정 출력
  console.log('[agent] OfficeGuard Mini PC Agent starting');
  console.log(`[agent] deviceId=${agentConfig.deviceId}`);
  console.log(`[agent] sourceIp=${sourceIp}`);
  console.log(`[agent] networkInterface=${agentConfig.networkInterface}`);
  console.log( `[agent] receiverDestination=${agentConfig.receiverDestinationIp}:${agentConfig.receiverDestinationPort}` );

  let dnsCollector: WindowsDnsCollector | undefined;
  let networkFlowCollector: WindowsNetworkFlowCollector | undefined;
  let sendQueue: Promise<void> = Promise.resolve();
  let shuttingDown = false;

  // 선택 사용자 별칭 포함 이벤트 Context 구성
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

  /**
   * SecurityEvent 순차 전송 등록
   */
  const enqueueEvent = (event: AgentSecurityEvent): void => {
    sendQueue = sendQueue
      .then(async () => {
        await sendSecurityEvent(event, {
          receiverUrl: agentConfig.receiverUrl,
          requestTimeoutMs: agentConfig.requestTimeoutMs,
        });

        console.log( `[agent] ${event.eventType} sent. eventId=${event.eventId}` );
      })
      .catch((error: unknown) => {
        console.error( `[agent] ${event.eventType} send failed. eventId=${event.eventId}`, error );
      });
  };

  /**
   * Agent 종료 처리
   */
  const shutdown = async (
    signal: string,
    exitCode: number,
  ): Promise<void> => {
    // 중복 종료 요청 차단
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    console.log(`[agent] shutdown requested. signal=${signal}`);

    // Event Collector 중지
    dnsCollector?.stop();
    networkFlowCollector?.stop();

    // 진행 중인 이벤트 전송 완료 대기
    await sendQueue;

    console.log('[agent] stopped');

    process.exit(exitCode);
  };

  // DNS Event 수집 시작
  dnsCollector = startWindowsDnsCollector({
    onRecord: (record) => {
      // Windows DNS 기록 변환
      const event = createDnsQueryEvent(record, eventContext);

      // 변환할 수 없는 DNS 기록 제외
      if (event === undefined) {
        console.error( `[agent] invalid DNS record skipped. recordId=${record.recordId}` );
        return;
      }

      console.log( `[agent] DNS_QUERY collected. domain=${event.metadata.domain} queryType=${event.metadata.queryType} eventId=${event.eventId}` );

      // DNS_QUERY 순차 전송
      enqueueEvent(event);
    },

    // DNS Collector 치명적 오류 처리
    onFatalError: (error) => {
      console.error('[agent] DNS collector failed:', error);
      void shutdown('dns-collector-error', 1);
    },
  });

  // Network Flow Event 수집 시작
  networkFlowCollector = startWindowsNetworkFlowCollector({
    sourceIp,

    // Agent Event Receiver 전송 연결 제외
    excludedDestinationIp: agentConfig.receiverDestinationIp,
    excludedDestinationPort: agentConfig.receiverDestinationPort,

    onRecord: (record) => {
      // Windows Network Flow 기록 변환
      const event = createNetworkFlowEvent(record, eventContext);

      // 변환할 수 없는 Network Flow 기록 제외
      if (event === undefined) {
        console.error( `[agent] invalid Network Flow record skipped. recordId=${record.recordId}` );
        return;
      }

      console.log( `[agent] NETWORK_FLOW collected. destination=${event.metadata.destinationIp}:${event.metadata.destinationPort} protocol=${event.metadata.protocol} eventId=${event.eventId}` );

      // NETWORK_FLOW 순차 전송
      enqueueEvent(event);
    },

    // Network Flow Collector 치명적 오류 처리
    onFatalError: (error) => {
      console.error('[agent] Network Flow collector failed:', error);
      void shutdown('network-flow-collector-error', 1);
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