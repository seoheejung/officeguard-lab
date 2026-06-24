import { Pool } from 'pg';

import { storageConfig } from '../config/storageConfig.js';

/**
 * PostgreSQL 연결 재사용을 위한 Connection Pool
 */
export const storagePool = new Pool({
  host: storageConfig.host,
  port: storageConfig.port,
  database: storageConfig.database,
  user: storageConfig.user,
  password: storageConfig.password,
});

/**
 * 유휴 PostgreSQL Client 연결 오류 처리
 */
storagePool.on('error', (error) => {
  console.error(
    '[storage] unexpected pool error:',
    error,
  );

  // 필수 Storage 연결 손실에 따른 애플리케이션 종료
  process.exit(1);
});

/**
 * PostgreSQL 연결과 필수 Storage 테이블 확인
 */
export const connectStorage = async (): Promise<void> => {
  // Pool에서 연결 확인용 Client 획득
  const client = await storagePool.connect();

  try {
    // public.security_events 테이블 존재 여부 조회
    const result = await client.query<{
      securityEventsTable: string | null;
    }>(`
      SELECT to_regclass('public.security_events')
        AS "securityEventsTable"
    `);

    // 테이블 조회 결과 추출
    const securityEventsTable =
      result.rows[0]?.securityEventsTable;

    // 필수 Storage 테이블 존재 여부 검증
    if (securityEventsTable == null) {
      throw new Error(
        '[storage] security_events table not found. Check PostgreSQL initialization.',
      );
    }

    console.log(
      `[storage] connected. host=${storageConfig.host} port=${storageConfig.port} database=${storageConfig.database}`,
    );
  } finally {
    // Connection Pool에 Client 반환
    client.release();
  }
};