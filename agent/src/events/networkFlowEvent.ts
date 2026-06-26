import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

export type NetworkProtocol = 'TCP' | 'UDP';

export interface NetworkFlowMetadata {
  destinationIp: string;
  destinationPort: number;
  protocol: NetworkProtocol;
  domain?: string;
  bytesIn?: number;
  bytesOut?: number;
}

export interface NetworkFlowEvent {
  eventId: string;
  eventType: 'NETWORK_FLOW';
  timestamp: string;
  sourceIp: string;
  deviceId?: string;
  userAlias?: string;
  message: string;
  metadata: NetworkFlowMetadata;
}

/**
 * Windows Filtering Platform 수집 결과
 */
export interface WindowsNetworkFlowRecord {
  recordId: number;
  timestamp: string;
  sourceAddress: string;
  destinationAddress: string;
  destinationPort: number;
  protocol: number;
}

/**
 * NETWORK_FLOW 생성에 필요한 Agent 정보
 */
interface CreateNetworkFlowEventContext {
  sourceIp: string;
  deviceId: string;
  userAlias?: string;
}

/**
 * Windows IP Protocol 번호 변환
 */
const normalizeProtocol = (
  protocol: number,
): NetworkProtocol | undefined => {
  switch (protocol) {
    case 6:
      return 'TCP';

    case 17:
      return 'UDP';

    default:
      return undefined;
  }
};

/**
 * Windows Network Flow 기록의 NETWORK_FLOW 변환
 */
export const createNetworkFlowEvent = (
  record: WindowsNetworkFlowRecord,
  context: CreateNetworkFlowEventContext,
): NetworkFlowEvent | undefined => {
  // 지정 Interface에서 시작된 연결 확인
  if (record.sourceAddress !== context.sourceIp) {
    return undefined;
  }

  // 목적지 IP 형식 검증
  if (isIP(record.destinationAddress) === 0) {
    return undefined;
  }

  // 목적지 Port 범위 검증
  if ( !Number.isInteger(record.destinationPort) ||
    record.destinationPort < 1 || record.destinationPort > 65_535 ) {
    return undefined;
  }

  // TCP 또는 UDP Protocol 변환
  const protocol = normalizeProtocol(record.protocol);

  // 미지원 Protocol 제외
  if (protocol === undefined) {
    return undefined;
  }

  // 이벤트 발생 시각 변환
  const timestampMs = Date.parse(record.timestamp);

  // 유효하지 않은 발생 시각 제외
  if (Number.isNaN(timestampMs)) {
    return undefined;
  }

  // 기존 NETWORK_FLOW 구조 생성
  const event: NetworkFlowEvent = {
    eventId: randomUUID(),
    eventType: 'NETWORK_FLOW',
    timestamp: new Date(timestampMs).toISOString(),
    sourceIp: context.sourceIp,
    deviceId: context.deviceId,
    message: `${record.destinationAddress}:${record.destinationPort} ${protocol} 연결이 관측되었습니다.`,
    metadata: {
      destinationIp: record.destinationAddress,
      destinationPort: record.destinationPort,
      protocol,
    },
  };

  // 선택 사용자 별칭 반영
  if (context.userAlias !== undefined) {
    event.userAlias = context.userAlias;
  }

  return event;
};