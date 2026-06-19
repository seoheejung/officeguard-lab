import type { SecurityEventBase } from './eventTypes.js';

/**
 * 초기 Network Flow 이벤트에서 처리할 전송 계층 프로토콜
 */
export type NetworkProtocol = 'TCP' | 'UDP';

/**
 * NETWORK_FLOW 이벤트의 세부 데이터
 */
export interface NetworkFlowMetadata {
  /**
   * 연결 대상 IP
   */
  destinationIp: string;

  /**
   * 연결 대상 포트
   */
  destinationPort: number;

  /**
   * 연결에 사용된 프로토콜
   */
  protocol: NetworkProtocol;

  /**
   * 목적지 IP와 연결된 도메인을 확인할 수 있는 경우 기록
   */
  domain?: string;

  /**
   * 관측된 inbound byte 수
   */
  bytesIn: number;

  /**
   * 관측된 outbound byte 수
   */
  bytesOut: number;
}

/**
 * 단말과 목적지 사이의 네트워크 연결 흐름을 나타내는 이벤트
 * 초기 단계에서는 실제 패킷을 수집하지 않고 Mock 이벤트로 사용
 */
export type NetworkFlowEvent = SecurityEventBase<
  'NETWORK_FLOW',
  NetworkFlowMetadata
> & {
  sourceIp: string;
};