import {
  startWindowsDnsCollector,
  type WindowsDnsCollector,
} from './collectors/windowsDnsCollector.js';
import {
  startWindowsFileCollector,
  type WindowsFileCollector,
} from './collectors/windowsFileCollector.js';
import {
  startWindowsNetworkFlowCollector,
  type WindowsNetworkFlowCollector,
} from './collectors/windowsNetworkFlowCollector.js';
import {
  startWindowsPrintCollector,
  type WindowsPrintCollector,
} from './collectors/windowsPrintCollector.js';
import {
  startWindowsProcessCollector,
  type WindowsProcessCollector,
} from './collectors/windowsProcessCollector.js';
import {
  startWindowsUsbCollector,
  type WindowsUsbCollector,
} from './collectors/windowsUsbCollector.js';
import { agentConfig } from './config/agentConfig.js';
import { createDnsQueryEvent } from './events/dnsQueryEvent.js';
import {
  createFileCopiedEvent,
  createFileEvent,
  createPrintRequestedEvent,
  createProcessStartEvent,
  createUsbDeviceEvent,
  type EndpointEvent,
  type EndpointEventContext,
  type WindowsFileRecord,
} from './events/endpointEvent.js';
import { createNetworkFlowEvent } from './events/networkFlowEvent.js';
import {
  findSourceFileCandidate,
  waitForStableFile,
} from './files/sourceFileMatcher.js';
import { resolveSourceIp } from './network/sourceIp.js';
import {
  sendSecurityEvent,
  type AgentSecurityEvent,
} from './sender/eventSender.js';

/**
 * Mini PC Agent 실행
 */
const startAgent = async (): Promise<void> => {
  // Windows 실행 환경 검증
  if (process.platform !== 'win32') {
    throw new Error('[agent] Windows platform is required');
  }

  // 설정된 Network Interface의 sourceIp 확인
  const sourceIp = resolveSourceIp(agentConfig.networkInterface);

  // Endpoint Event 공통 실행 환경 구성
  const eventContext: EndpointEventContext =
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

  console.log('[agent] OfficeGuard Mini PC Agent starting');
  console.log(`[agent] deviceId=${agentConfig.deviceId}`);
  console.log(`[agent] sourceIp=${sourceIp}`);
  console.log(
    `[agent] networkInterface=${agentConfig.networkInterface}`,
  );
  console.log(
    `[agent] receiverDestination=${agentConfig.receiverDestinationIp}:${agentConfig.receiverDestinationPort}`,
  );
  console.log(
    `[agent] fileWatchPath=${agentConfig.fileWatchPath}`,
  );

  let dnsCollector: WindowsDnsCollector | undefined;
  let networkFlowCollector: WindowsNetworkFlowCollector | undefined;
  let processCollector: WindowsProcessCollector | undefined;
  let fileCollector: WindowsFileCollector | undefined;
  let usbCollector: WindowsUsbCollector | undefined;
  let printCollector: WindowsPrintCollector | undefined;

  // USB 장치별 파일 감시 Collector 관리
  const usbFileCollectors = new Map<string, WindowsFileCollector>();

  // 처리 중인 USB 파일 경로 관리
  const pendingUsbFilePaths = new Set<string>();

  // 최근 처리 완료 USB 파일 경로 관리
  const lastUsbFileHandledAtByPath = new Map<string, number>();

  // SecurityEvent 순차 전송 Queue
  let sendQueue: Promise<void> = Promise.resolve();
  let shuttingDown = false;

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

        console.log(
          `[agent] ${event.eventType} sent. eventId=${event.eventId}`,
        );
      })
      .catch((error: unknown) => {
        console.error(
          `[agent] ${event.eventType} send failed. eventId=${event.eventId}`,
          error,
        );
      });
  };

  /**
   * Endpoint Event 출력 및 전송
   */
  const handleEndpointEvent = (event: EndpointEvent): void => {
    console.log(
      `[agent] ${event.eventType} collected. eventId=${event.eventId}`,
    );

    enqueueEvent(event);
  };

  /**
   * Agent 종료 처리
   */
  const shutdown = async (
    signal: string,
    exitCode: number,
  ): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    console.log(
      `[agent] shutdown requested. signal=${signal}`,
    );

    // 기본 Collector 종료
    dnsCollector?.stop();
    networkFlowCollector?.stop();
    processCollector?.stop();
    fileCollector?.stop();
    usbCollector?.stop();
    printCollector?.stop();

    // USB 파일 감시 Collector 종료
    for (const collector of usbFileCollectors.values()) {
      collector.stop();
    }

    usbFileCollectors.clear();
    pendingUsbFilePaths.clear();
    lastUsbFileHandledAtByPath.clear();

    // 등록된 전송 작업 완료 대기
    await sendQueue;

    console.log('[agent] stopped');
    process.exit(exitCode);
  };

  /**
   * USB 대상 파일 생성·수정 처리
   */
  const handleUsbFileChange = async (
    record: WindowsFileRecord,
  ): Promise<void> => {
    const pendingPathKey = record.path.toLowerCase();
    const currentTime = Date.now();
    const lastHandledAt =
      lastUsbFileHandledAtByPath.get(pendingPathKey);

    // 동일 USB 파일의 처리 중 이벤트 차단
    if (pendingUsbFilePaths.has(pendingPathKey)) {
      return;
    }

    // 처리 완료 직후 발생한 후속 이벤트 제한
    if (
      lastHandledAt !== undefined &&
      currentTime - lastHandledAt <
        agentConfig.fileEventDebounceMs
    ) {
      return;
    }

    pendingUsbFilePaths.add(pendingPathKey);

    try {
      // USB 대상 파일 쓰기 완료 대기
      const stableSizeBytes = await waitForStableFile({
        destinationPath: record.path,
        intervalMs: agentConfig.usbCopySettleIntervalMs,
        maxAttempts: agentConfig.usbCopySettleMaxAttempts,
      });

      if (shuttingDown) {
        return;
      }

      if (stableSizeBytes === undefined) {
        console.error(
          `[agent] USB file stabilization failed. path=${record.path}`,
        );

        // 안정화 실패 시 원래 파일 변경 이벤트 처리
        const fileEvent = createFileEvent(
          record,
          eventContext,
        );

        if (fileEvent !== undefined) {
          handleEndpointEvent(fileEvent);
        }

        return;
      }

      // 안정화 완료 파일 정보 구성
      const stabilizedRecord: WindowsFileRecord = {
        timestamp: new Date().toISOString(),
        changeType: record.changeType,
        path: record.path,
        sizeBytes: stableSizeBytes,
      };

      // 최종 파일 크기 기준 원본 후보 검색
      const sourcePath = await findSourceFileCandidate({
        sourceRoot: agentConfig.fileWatchPath,
        destinationPath: stabilizedRecord.path,
        destinationSizeBytes: stableSizeBytes,
      });

      if (shuttingDown) {
        return;
      }

      if (sourcePath !== undefined) {
        // 원본 확인 완료 FILE_COPIED 생성
        const copiedEvent = createFileCopiedEvent(
          {
            timestamp: stabilizedRecord.timestamp,
            sourcePath,
            destinationPath: stabilizedRecord.path,
            sizeBytes: stableSizeBytes,
          },
          eventContext,
        );

        if (copiedEvent !== undefined) {
          handleEndpointEvent(copiedEvent);
        }

        return;
      }

      // 원본 확인 실패 시 실제 변경 타입 유지
      const fileEvent = createFileEvent(
        stabilizedRecord,
        eventContext,
      );

      if (fileEvent !== undefined) {
        handleEndpointEvent(fileEvent);
      }
    } finally {
      pendingUsbFilePaths.delete(pendingPathKey);
      lastUsbFileHandledAtByPath.set(
        pendingPathKey,
        Date.now(),
      );
    }
  };

  /**
   * USB 드라이브 파일 감시 시작
   */
  const startUsbFileCollector = (
    deviceKey: string,
    driveLetter: string,
  ): void => {
    const collectorKey =
      `${deviceKey}:${driveLetter.toLowerCase()}`;

    if (usbFileCollectors.has(collectorKey)) {
      return;
    }

    const collector = startWindowsFileCollector({
      watchPath: driveLetter,
      debounceMs: agentConfig.fileEventDebounceMs,
      collectorName: `usb-file-collector:${driveLetter}`,

      onRecord: (record) => {
        // USB 파일 생성·수정 이벤트만 처리
        if (
          record.changeType !== 'CREATED' &&
          record.changeType !== 'MODIFIED'
        ) {
          return;
        }

        void handleUsbFileChange(record).catch((error) => {
          console.error(
            `[agent] USB file processing failed. path=${record.path}`,
            error,
          );
        });
      },

      onFatalError: (error) => {
        console.error(
          `[agent] USB file collector failed. drive=${driveLetter}`,
          error,
        );

        void shutdown('usb-file-collector-error', 1);
      },
    });

    usbFileCollectors.set(collectorKey, collector);
  };

  /**
   * USB 장치 파일 감시 종료
   */
  const stopUsbFileCollectors = (deviceKey: string): void => {
    for (const [
      collectorKey,
      collector,
    ] of usbFileCollectors) {
      if (!collectorKey.startsWith(`${deviceKey}:`)) {
        continue;
      }

      collector.stop();
      usbFileCollectors.delete(collectorKey);
    }
  };

  // DNS Event 수집 시작
  dnsCollector = startWindowsDnsCollector({
    onRecord: (record) => {
      const event = createDnsQueryEvent(
        record,
        eventContext,
      );

      if (event === undefined) {
        console.error(
          `[agent] invalid DNS record skipped. recordId=${record.recordId}`,
        );

        return;
      }

      console.log(
        `[agent] DNS_QUERY collected. domain=${event.metadata.domain} queryType=${event.metadata.queryType} eventId=${event.eventId}`,
      );

      enqueueEvent(event);
    },

    onFatalError: (error) => {
      console.error(
        '[agent] DNS collector failed:',
        error,
      );

      void shutdown('dns-collector-error', 1);
    },
  });

  // Network Flow 수집 시작
  networkFlowCollector = startWindowsNetworkFlowCollector({
    sourceIp,
    excludedDestinationIp:
      agentConfig.receiverDestinationIp,
    excludedDestinationPort:
      agentConfig.receiverDestinationPort,

    onRecord: (record) => {
      const event = createNetworkFlowEvent(
        record,
        eventContext,
      );

      if (event === undefined) {
        console.error(
          `[agent] invalid Network Flow record skipped. recordId=${record.recordId}`,
        );

        return;
      }

      console.log(
        `[agent] NETWORK_FLOW collected. destination=${event.metadata.destinationIp}:${event.metadata.destinationPort} protocol=${event.metadata.protocol} eventId=${event.eventId}`,
      );

      enqueueEvent(event);
    },

    onFatalError: (error) => {
      console.error(
        '[agent] Network Flow collector failed:',
        error,
      );

      void shutdown(
        'network-flow-collector-error',
        1,
      );
    },
  });

  // Process Event 수집 시작
  processCollector = startWindowsProcessCollector({
    onRecord: (record) => {
      const event = createProcessStartEvent(
        record,
        eventContext,
      );

      if (event === undefined) {
        console.error(
          '[agent] invalid Process record skipped',
        );

        return;
      }

      handleEndpointEvent(event);
    },

    onFatalError: (error) => {
      console.error(
        '[agent] Process collector failed:',
        error,
      );

      void shutdown('process-collector-error', 1);
    },
  });

  // 일반 파일 Event 수집 시작
  fileCollector = startWindowsFileCollector({
    watchPath: agentConfig.fileWatchPath,
    debounceMs: agentConfig.fileEventDebounceMs,

    onRecord: (record) => {
      const event = createFileEvent(
        record,
        eventContext,
      );

      if (event === undefined) {
        console.error(
          `[agent] invalid File record skipped. path=${record.path}`,
        );

        return;
      }

      handleEndpointEvent(event);
    },

    onFatalError: (error) => {
      console.error(
        '[agent] File collector failed:',
        error,
      );

      void shutdown('file-collector-error', 1);
    },
  });

  // USB 저장 장치 Event 수집 시작
  usbCollector = startWindowsUsbCollector({
    onRecord: (record) => {
      const event = createUsbDeviceEvent(
        record,
        eventContext,
      );

      if (event === undefined) {
        console.error(
          '[agent] invalid USB record skipped',
        );

        return;
      }

      handleEndpointEvent(event);

      if (record.changeType === 'CONNECTED') {
        // USB 논리 드라이브별 파일 감시 시작
        for (const driveLetter of record.driveLetters) {
          startUsbFileCollector(
            record.deviceKey,
            driveLetter,
          );
        }

        return;
      }

      // USB 장치 파일 감시 종료
      stopUsbFileCollectors(record.deviceKey);
    },

    onFatalError: (error) => {
      console.error(
        '[agent] USB collector failed:',
        error,
      );

      void shutdown('usb-collector-error', 1);
    },
  });

  // Print Job Event 수집 시작
  printCollector = startWindowsPrintCollector({
    onRecord: (record) => {
      const event = createPrintRequestedEvent(
        record,
        eventContext,
      );

      if (event === undefined) {
        console.error(
          '[agent] invalid Print Job record skipped',
        );

        return;
      }

      handleEndpointEvent(event);
    },

    onFatalError: (error) => {
      console.error(
        '[agent] Print collector failed:',
        error,
      );

      void shutdown('print-collector-error', 1);
    },
  });

  // 종료 신호 처리
  process.once('SIGINT', () => {
    void shutdown('SIGINT', 0);
  });

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM', 0);
  });

  console.log(
    '[agent] running. press Ctrl+C to stop',
  );
};

void startAgent().catch((error) => {
  console.error(
    '[agent] failed to start:',
    error,
  );

  process.exit(1);
});