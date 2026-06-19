import type {
  DnsQueryEvent,
  FileCopiedEvent,
  NetworkFlowEvent,
  RuleHitEvent,
  SecurityEvent,
  UsbConnectedEvent,
} from '../index.js';

/**
 * DNS_QUERY 타입 검사용 예시
 */
export const dnsQueryEventSample = {
  eventId: '11111111-1111-4111-8111-111111111111',
  eventType: 'DNS_QUERY',
  timestamp: '2026-06-20T01:30:00.000Z',
  sourceIp: '192.168.0.12',
  message: 'github.com 도메인 조회가 허용되었습니다.',
  metadata: {
    domain: 'github.com',
    queryType: 'A',
    action: 'ALLOW',
    responseCode: 'NOERROR',
  },
} satisfies DnsQueryEvent;

/**
 * NETWORK_FLOW 타입 검사용 예시
 *
 * 목적지 IP는 문서와 테스트에서 사용할 수 있는 TEST-NET 주소를 사용
 */
export const networkFlowEventSample = {
  eventId: '22222222-2222-4222-8222-222222222222',
  eventType: 'NETWORK_FLOW',
  timestamp: '2026-06-20T01:31:00.000Z',
  sourceIp: '192.168.0.12',
  message: '외부 HTTPS 연결 흐름이 관측되었습니다.',
  metadata: {
    destinationIp: '203.0.113.10',
    destinationPort: 443,
    protocol: 'TCP',
    domain: 'example.com',
    bytesIn: 92_310,
    bytesOut: 18_240,
  },
} satisfies NetworkFlowEvent;

/**
 * USB_CONNECTED 타입 검사용 예시
 */
export const usbConnectedEventSample = {
  eventId: '33333333-3333-4333-8333-333333333333',
  eventType: 'USB_CONNECTED',
  timestamp: '2026-06-20T01:35:00.000Z',
  sourceIp: '192.168.0.12',
  deviceId: 'test-laptop-01',
  userAlias: 'user-001',
  message: '테스트 단말에 USB 저장 장치가 연결되었습니다.',
  metadata: {
    vendor: 'MockVendor',
    productName: 'Mock USB Drive',
    serialAlias: 'usb-device-001',
  },
} satisfies UsbConnectedEvent;

/**
 * FILE_COPIED 타입 검사용 예시
 */
export const fileCopiedEventSample = {
  eventId: '44444444-4444-4444-8444-444444444444',
  eventType: 'FILE_COPIED',
  timestamp: '2026-06-20T01:35:20.000Z',
  sourceIp: '192.168.0.12',
  deviceId: 'test-laptop-01',
  userAlias: 'user-001',
  message: '테스트 파일이 USB 저장 장치로 복사되었습니다.',
  metadata: {
    sourcePath: 'C:\\Lab\\sample.txt',
    destinationPath: 'E:\\sample.txt',
    sizeBytes: 1_048_576,
  },
} satisfies FileCopiedEvent;

/**
 * RULE_HIT 타입 검사용 예시
 */
export const ruleHitEventSample = {
  eventId: '55555555-5555-4555-8555-555555555555',
  eventType: 'RULE_HIT',
  timestamp: '2026-06-20T01:35:21.000Z',
  sourceIp: '192.168.0.12',
  deviceId: 'test-laptop-01',
  userAlias: 'user-001',
  severity: 'HIGH',
  message: 'USB 연결 직후 파일 복사가 발생했습니다.',
  metadata: {
    ruleId: 'USB_FILE_COPY_DETECTED',
    relatedEventIds: [
      usbConnectedEventSample.eventId,
      fileCopiedEventSample.eventId,
    ],
    windowSeconds: 60,
  },
} satisfies RuleHitEvent;

/**
 * 모든 예시가 SecurityEvent union에 포함되는지 컴파일 단계에서 확인
 */
export const securityEventSamples = [
  dnsQueryEventSample,
  networkFlowEventSample,
  usbConnectedEventSample,
  fileCopiedEventSample,
  ruleHitEventSample,
] satisfies readonly SecurityEvent[];