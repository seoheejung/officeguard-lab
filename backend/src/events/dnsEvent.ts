import type { SecurityEventBase } from './eventTypes.js';

/**
 * 초기 DNS 관측 범위에서 처리할 query type
 * 정의되지 않은 타입은 OTHER로 정규화
 */
export type DnsQueryType =
  | 'A'
  | 'AAAA'
  | 'CNAME'
  | 'MX'
  | 'TXT'
  | 'PTR'
  | 'NS'
  | 'OTHER';

/**
 * DNS 요청에 대해 적용된 처리 결과
 */
export type DnsAction = 'ALLOW' | 'BLOCK';

/**
 * DNS 응답 상태를 프로젝트 내부 값으로 정규화한 타입
 */
export type DnsResponseCode =
  | 'NOERROR'
  | 'NXDOMAIN'
  | 'SERVFAIL'
  | 'REFUSED'
  | 'OTHER';

/**
 * DNS_QUERY 이벤트의 세부 데이터
 */
export interface DnsQueryMetadata {
  /**
   * 클라이언트가 조회한 도메인
   */
  domain: string;

  /**
   * A, AAAA 등의 DNS query type
   */
  queryType: DnsQueryType;

  /**
   * DNS 서버가 요청을 허용하거나 차단한 결과
   */
  action: DnsAction;

  /**
   * DNS 응답 코드를 정규화한 값
   */
  responseCode: DnsResponseCode;
}

/**
 * DNS 서버 또는 DNS Collector에서 생성하는 이벤트
 * DNS 요청은 요청한 클라이언트를 식별해야 하므로 sourceIp가 필수
 */
export type DnsQueryEvent = SecurityEventBase<
  'DNS_QUERY',
  DnsQueryMetadata
> & {
  sourceIp: string;
};