import { getRequiredEnv } from './env.js';

/**
 * KAFKA_BROKERS 환경 변수 브로커 주소 목록 변환
 */
const parseBrokers = (value: string): string[] => {
  const brokers = value
    .split(',')
    .map((broker) => broker.trim())
    .filter((broker) => broker.length > 0);

  if (brokers.length === 0) {
    throw new Error(
      `[config] KAFKA_BROKERS must contain at least one broker. received=${value}`,
    );
  }

  return brokers;
};

/**
 * Kafka 연결 및 Topic 설정
 */
export const kafkaConfig = {
  clientId: getRequiredEnv('KAFKA_CLIENT_ID'),
  brokers: parseBrokers(getRequiredEnv('KAFKA_BROKERS')),
  securityEventsTopic: getRequiredEnv(
    'KAFKA_SECURITY_EVENTS_TOPIC',
  ),
  consumerGroupId: getRequiredEnv(
    'KAFKA_CONSUMER_GROUP_ID',
  ),
} as const;