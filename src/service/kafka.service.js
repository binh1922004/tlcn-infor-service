import { Kafka } from "kafkajs";
import {updateSubmissionStatus} from "./sumission.service.js";

const KafkaProducerSingleton = (function () {
    let instance;

    function init() {
        console.log("Initializing Kafka");
        const client = new Kafka({
            clientId: 'bnoj-app',
            brokers: ['localhost:9092']
        })
        const producer = client.producer();
        const consumer = client.consumer({ groupId: 'bnoj-group-2' });

        let isConnected = false;
        const topicHandlers = new Map(); // Lưu handler cho mỗi topic

        return {
            async connect() {
                if (!isConnected) {
                    await producer.connect();
                    await consumer.connect();
                    isConnected = true;
                    console.log('Kafka connected');
                }
            },

            // Register handler for each topic
            registerHandler(topic, handler) {
                if (typeof handler !== 'function') {
                    throw new Error('Handler must be a function');
                }
                topicHandlers.set(topic, handler);
                console.log(`Handler registered for topic: ${topic}`);
            },

            // Subscribe với xử lý riêng cho từng topic
            async subscribe(topics) {
                await this.connect();

                // topics có thể là string hoặc array
                const topicList = Array.isArray(topics) ? topics : [topics];
                console.log(`Subscribed topics: ${JSON.stringify(topicList)}`);

                await consumer.subscribe({ topics: topicList });

                await consumer.run({
                    eachMessage: async ({ topic, partition, message }) => {
                        const handler = topicHandlers.get(topic);

                        try {
                            if (handler) {
                                // Calling the registered handler for the topic
                                await handler({
                                    topic,
                                    partition,
                                    message: message,
                                    key: message.key?.toString(),
                                });
                            } else {
                                console.warn(`No handler registered for topic: ${topic}`);
                            }
                        } catch (error) {
                            console.error(`Error processing message from ${topic}:`, error);
                        }
                    },
                });
            },

            async sendMessage(topic, message) {
                await this.connect();
                return await producer.send({
                    topic: topic,
                    messages: [{ value: JSON.stringify(message) }],
                });
            },

            async disconnect() {
                if (isConnected) {
                    await producer.disconnect();
                    await consumer.disconnect();
                    isConnected = false;
                    console.log('Kafka disconnected');
                }
            }
        };
    }

    return {
        getInstance: function () {
            if (!instance) {
                instance = init();
            }
            return instance;
        }
    };
})();

export const sendMessage = async (topic, message) => {
    const kafka = KafkaProducerSingleton.getInstance();
    const time = new Date().toISOString();
    console.log(`[${time}] Sending message to topic "${topic}":`, message);
    return await kafka.sendMessage(topic, message);
};

// Cách sử dụng:
export const setupKafkaConsumers = async () => {
    const kafka = KafkaProducerSingleton.getInstance();

    // Register for 'user-events' topic
    kafka.registerHandler('result-topic', async ({ topic, partition, message, key }) => {
        console.log(`Processing user event: ${message.value.toString()}`);
        const data = JSON.parse(message.value.toString());
        await updateSubmissionStatus(data.submissionId, data);
        const time = new Date().toISOString()
        console.log(`[${time}] update submission status:`, data.submissionId);
    });

    // Subscribe tất cả topics
    await kafka.subscribe(['result-topic']);
};