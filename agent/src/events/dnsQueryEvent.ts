import { randomUUID } from 'node:crypto';

export type DnsQueryType =
  | 'A'
  | 'AAAA'
  | 'CNAME'
  | 'MX'
  | 'TXT'
  | 'PTR'
  | 'NS'
  | 'OTHER';

export type DnsAction = 'ALLOW' | 'BLOCK';

export type DnsResponseCode =
  | 'NOERROR'
  | 'NXDOMAIN'
  | 'SERVFAIL'
  | 'REFUSED'
  | 'OTHER';

export interface DnsQueryMetadata {
  domain: string;
  queryType: DnsQueryType;
  action: DnsAction;
  responseCode: DnsResponseCode;
}

export interface DnsQueryEvent {
  eventId: string;
  eventType: 'DNS_QUERY';
  timestamp: string;
  sourceIp: string;
  deviceId?: string;
  userAlias?: string;
  message: string;
  metadata: DnsQueryMetadata;
}

/**
 * Windows DNS Client Event Log 수집 결과
 */
export interface WindowsDnsRecord {
  recordId: number;
  timestamp: string;
  queryName: string;
  queryType: number;
  queryStatus: number;
}

/**
 * DNS_QUERY 생성에 필요한 Agent 정보
 */
interface CreateDnsQueryEventContext {
  sourceIp: string;
  deviceId: string;
  userAlias?: string;
}

/**
 * Windows DNS Query Type 변환
 */
const normalizeQueryType = (queryType: number): DnsQueryType => {
  switch (queryType) {
    case 1:
      return 'A';
    case 2:
      return 'NS';
    case 5:
      return 'CNAME';
    case 12:
      return 'PTR';
    case 15:
      return 'MX';
    case 16:
      return 'TXT';
    case 28:
      return 'AAAA';
    default:
      return 'OTHER';
  }
};

/**
 * Windows DNS Query Status 변환
 */
const normalizeResponseCode = (queryStatus: number): DnsResponseCode => {
  switch (queryStatus) {
    case 0:
      return 'NOERROR';
    case 9002:
      return 'SERVFAIL';
    case 9003:
      return 'NXDOMAIN';
    case 9005:
      return 'REFUSED';
    default:
      return 'OTHER';
  }
};

/**
 * Windows DNS 기록의 DNS_QUERY 변환
 */
export const createDnsQueryEvent = (
  record: WindowsDnsRecord,
  context: CreateDnsQueryEventContext,
): DnsQueryEvent | undefined => {
  // 조회 도메인 정규화
  const domain = record.queryName.trim().toLowerCase().replace(/\.$/, '');

  // 빈 도메인 제외
  if (domain === '') {
    return undefined;
  }

  // DNS 기록 발생 시각 변환
  const timestampMs = Date.parse(record.timestamp);

  // 유효하지 않은 발생 시각 제외
  if (Number.isNaN(timestampMs)) {
    return undefined;
  }

  // Windows Query Status 변환
  const responseCode = normalizeResponseCode(record.queryStatus);

  // 기존 DNS_QUERY 구조 생성
  const event: DnsQueryEvent = {
    eventId: randomUUID(),
    eventType: 'DNS_QUERY',
    timestamp: new Date(timestampMs).toISOString(),
    sourceIp: context.sourceIp,
    deviceId: context.deviceId,
    message: `${domain} DNS 조회가 완료되었습니다.`,
    metadata: {
      domain,
      queryType: normalizeQueryType(record.queryType),
      action: responseCode === 'REFUSED' ? 'BLOCK' : 'ALLOW',
      responseCode,
    },
  };

  // 선택 사용자 별칭 반영
  if (context.userAlias !== undefined) {
    event.userAlias = context.userAlias;
  }

  return event;
};