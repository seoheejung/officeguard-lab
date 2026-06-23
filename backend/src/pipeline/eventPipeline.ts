import { Kafka, Partitioners } from 'kafkajs';

import { kafkaConfig } from '../config/kafkaConfig.js';
import type { SecurityEvent } from '../events/index.js';

/**
 * Kafka Client 생성
 */
const kafka = new Kafka({
  clientId: kafkaConfig.clientId,
  brokers: kafkaConfig.brokers,
});

/**
 * Topic 관리용 Admin Client 생성
 */
const admin = kafka.admin();

/**
 * SecurityEvent 발행용 Producer 생성
 */
const producer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
});

/**
 * SecurityEvent 수신용 Consumer 생성
 */
const consumer = kafka.consumer({
  groupId: kafkaConfig.consumerGroupId,
});

/**
 * SecurityEvent Topic 생성
 */
const ensureSecurityEventsTopic = async (): Promise<void> => {
  await admin.connect();

  try {
    const created = await admin.createTopics({
      waitForLeaders: true,
      topics: [
        {
          topic: kafkaConfig.securityEventsTopic,
          numPartitions: 1,
          replicationFactor: 1,
        },
      ],
    });

    if (created) {
      console.log(
        `[kafka-admin] topic created. topic=${kafkaConfig.securityEventsTopic}`,
      );
      return;
    }

    console.log(
      `[kafka-admin] topic already exists. topic=${kafkaConfig.securityEventsTopic}`,
    );
  } finally {
    await admin.disconnect();
  }
};

/**
 * Kafka Consumer 메시지 처리
 */
const startSecurityEventConsumer = async (): Promise<void> => {
  await consumer.connect();

  console.log(
    `[kafka-consumer] connected. groupId=${kafkaConfig.consumerGroupId}`,
  );

  await consumer.subscribe({
    topic: kafkaConfig.securityEventsTopic,
    fromBeginning: false,
  });

  console.log(
    `[kafka-consumer] subscribed. topic=${kafkaConfig.securityEventsTopic}`,
  );

  await consumer.run({
    eachMessage: async ({
      topic,
      partition,
      message,
    }): Promise<void> => {
      if (message.value === null) {
        console.error(
          `[kafka-consumer] empty message. topic=${topic} partition=${partition} offset=${message.offset}`,
        );
        return;
      }

      try {
        const event = JSON.parse(
          message.value.toString('utf8'),
        ) as SecurityEvent;

        console.log(
          `[kafka-consumer] received. topic=${topic} partition=${partition} offset=${message.offset} eventType=${event.eventType} eventId=${event.eventId}`,
          event,
        );
      } catch (error) {
        console.error(
          `[kafka-consumer] invalid JSON message. topic=${topic} partition=${partition} offset=${message.offset}`,
          error,
        );
      }
    },
  });
};

/**
 * Kafka Topic, Producer, Consumer 초기화
 */
export const startEventPipeline = async (): Promise<void> => {
  await ensureSecurityEventsTopic();

  await producer.connect();

  console.log('[kafka-producer] connected');

  await startSecurityEventConsumer();
};

/**
 * SecurityEvent Kafka 발행
 */
export const publishSecurityEvent = async (
  event: SecurityEvent,
): Promise<void> => {
  await producer.send({
    topic: kafkaConfig.securityEventsTopic,
    messages: [
      {
        key: event.eventId,
        value: JSON.stringify(event),
      },
    ],
  });

  console.log(
    `[kafka-producer] published. eventType=${event.eventType} eventId=${event.eventId}`,
  );
};