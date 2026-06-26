import type { SecurityEventBase } from './eventTypes.js';

/**
 * Network Flow 전송 계층 Protocol
 */
export type NetworkProtocol = 'TCP' | 'UDP';

/**
 * NETWORK_FLOW 이벤트 세부 데이터
 */
export interface NetworkFlowMetadata {
  /**
   * 연결 대상 IP
   */
  destinationIp: string;

  /**
   * 연결 대상 Port
   */
  destinationPort: number;

  /**
   * 연결에 사용된 Protocol
   */
  protocol: NetworkProtocol;

  /**
   * 목적지 IP와 연결된 도메인을 확인할 수 있는 경우 기록
   */
  domain?: string;

  /**
   * 관측 가능한 경우 기록하는 inbound byte 수
   */
  bytesIn?: number;

  /**
   * 관측 가능한 경우 기록하는 outbound byte 수
   */
  bytesOut?: number;
}

/**
 * Mini PC와 목적지 사이의 네트워크 연결 이벤트
 */
export type NetworkFlowEvent = SecurityEventBase<
  'NETWORK_FLOW',
  NetworkFlowMetadata
> & {
  sourceIp: string;
};