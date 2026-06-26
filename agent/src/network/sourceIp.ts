import { networkInterfaces } from 'node:os';

/**
 * 지정한 Network Interface의 IPv4 조회
 */
export const resolveSourceIp = (interfaceName: string): string => {
  // 시스템 Network Interface 목록 조회
  const interfaces = networkInterfaces();

  // 지정한 Interface의 주소 목록 조회
  const addresses = interfaces[interfaceName];

  // 존재하지 않는 Interface 검증
  if (addresses === undefined) {
    const availableInterfaces = Object.keys(interfaces).join(', ');

    throw new Error(
      `[agent-network] interface not found. requested=${interfaceName} available=${availableInterfaces}`,
    );
  }

  // 외부 통신 가능한 IPv4 주소 조회
  const ipv4Address = addresses.find(
    (address) =>
      address.family === 'IPv4' &&
      !address.internal &&
      !address.address.startsWith('169.254.'),
  );

  // 사용 가능한 IPv4 주소 검증
  if (ipv4Address === undefined) {
    throw new Error(
      `[agent-network] usable IPv4 address not found. interface=${interfaceName}`,
    );
  }

  // Mini PC sourceIp 반환
  return ipv4Address.address;
};