import { randomUUID } from 'node:crypto';

import type {
  DnsQueryEvent,
  FileCopiedEvent,
  SecurityEvent,
  UsbConnectedEvent,
} from '../events/index.js';

const MOCK_SOURCE_IP = '192.168.0.12';
const MOCK_DEVICE_ID = 'test-laptop-01';
const MOCK_USER_ALIAS = 'user-001';

type MockScenarioType = 'NORMAL' | 'SUSPICIOUS';

interface MockEventStep {
  scenarioType: MockScenarioType;
  createEvent: () => SecurityEvent;
}

/**
 * 모든 Mock 이벤트에서 사용하는 고유 ID와 발생 시각 생성
 */
const createEventIdentity = (): {
  eventId: string;
  timestamp: string;
} => ({
  eventId: randomUUID(),
  timestamp: new Date().toISOString(),
});

/**
 * 지정한 도메인의 DNS Query 이벤트 생성
 */
const createDnsQueryEvent = (
  domain: string,
  message: string,
): DnsQueryEvent => ({
  ...createEventIdentity(),
  eventType: 'DNS_QUERY',
  sourceIp: MOCK_SOURCE_IP,
  deviceId: MOCK_DEVICE_ID,
  userAlias: MOCK_USER_ALIAS,
  message,
  metadata: {
    domain,
    queryType: 'A',
    action: 'ALLOW',
    responseCode: 'NOERROR',
  },
});

/**
 * 테스트 단말의 USB 연결 이벤트 생성
 *
 * 실제 USB 시리얼 번호 대신 테스트용 별칭 사용
 */
const createUsbConnectedEvent = (): UsbConnectedEvent => ({
  ...createEventIdentity(),
  eventType: 'USB_CONNECTED',
  sourceIp: MOCK_SOURCE_IP,
  deviceId: MOCK_DEVICE_ID,
  userAlias: MOCK_USER_ALIAS,
  message: '테스트 단말에 USB 저장 장치가 연결되었습니다.',
  metadata: {
    vendor: 'MockVendor',
    productName: 'Mock USB Drive',
    serialAlias: 'usb-device-001',
  },
});

/**
 * 테스트 파일의 USB 복사 이벤트 생성
 *
 * 실제 파일을 읽거나 복사하지 않고 Mock 메타데이터만 생성
 */
const createFileCopiedEvent = (): FileCopiedEvent => ({
  ...createEventIdentity(),
  eventType: 'FILE_COPIED',
  sourceIp: MOCK_SOURCE_IP,
  deviceId: MOCK_DEVICE_ID,
  userAlias: MOCK_USER_ALIAS,
  message: '테스트 파일이 USB 저장 장치로 복사되었습니다.',
  metadata: {
    sourcePath: 'C:\\Lab\\sample-report.txt',
    destinationPath: 'E:\\sample-report.txt',
    sizeBytes: 1_048_576,
  },
});

/**
 * Phase 3에서 순서대로 반복할 Mock 이벤트 목록
 *
 * 이벤트 생성 함수를 저장하여 실행할 때마다 새로운 eventId와 timestamp를 생성
 */
const mockEventSteps: readonly MockEventStep[] = [
  {
    scenarioType: 'NORMAL',
    createEvent: () =>
      createDnsQueryEvent(
        'docs.example.com',
        '정상 테스트 도메인의 DNS 조회가 발생했습니다.',
      ),
  },
  {
    scenarioType: 'SUSPICIOUS',
    createEvent: createUsbConnectedEvent,
  },
  {
    scenarioType: 'SUSPICIOUS',
    createEvent: createFileCopiedEvent,
  },
  {
    scenarioType: 'SUSPICIOUS',
    createEvent: () =>
      createDnsQueryEvent(
        'mail.example.com',
        '파일 복사 후 외부 전송 역할의 테스트 도메인이 조회되었습니다.',
      ),
  },
];

/**
 * 정의된 Mock 이벤트를 지정된 주기로 한 건씩 순차 생성
 */
export const startMockEventGenerator = (intervalMs: number): void => {
  let currentStepIndex = 0;

  const generateNextEvent = (): void => {
    const currentStep = mockEventSteps[currentStepIndex];

    if (currentStep === undefined) {
      throw new Error(
        `[mock-event] step not found. currentStepIndex=${currentStepIndex}`,
      );
    }

    const event = currentStep.createEvent();

    console.log(
      `[mock-event][${currentStep.scenarioType}] ${event.eventType}: ${event.message}`,
      event,
    );

    currentStepIndex = (currentStepIndex + 1) % mockEventSteps.length;
  };

  console.log(`[mock-event] generator started. interval=${intervalMs}ms`);

  // 서버 시작 직후 첫 번째 이벤트를 생성
  generateNextEvent();

  setInterval(generateNextEvent, intervalMs);
};