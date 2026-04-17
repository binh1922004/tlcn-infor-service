import { Kafka } from "kafkajs";
import { updateSubmissionStatus } from "./sumission.service.js";
import { config } from "../../config/env.js";
import problemModels from "../models/problem.models.js";
import aiConversationModel from "../models/aiConversation.model.js";

const KafkaProducerSingleton = (function () {
    let instance;

    function init() {
        console.log("Initializing Kafka");
        const client = new Kafka({
            clientId: 'bnoj-app',
            brokers: [config.kafka_brokers],
            sasl: {
                mechanism: 'PLAIN',
                username: config.kafka_user,
                password: config.kafka_password
            }
        })
        const producer = client.producer();
        const consumer = client.consumer({ groupId: 'bnoj-group-2' });

        let isConnected = false;
        const topicHandlers = new Map(); // Lưu handler cho mỗi topic

        return {
            async connect() {
                if (!isConnected) {
                    try {
                        const admin = client.admin();
                        await admin.connect();
                        await admin.createTopics({
                            topics: [
                                { topic: 'result-topic' },
                                { topic: 'ai_request' },
                                { topic: 'ai_response' },
                                { topic: 'submission-topic' }
                            ]
                        });
                        await admin.disconnect();
                        console.log('Kafka topics initialized');
                    } catch (e) {
                        console.log('Kafka admin topic creation error (may already exist):', e.message);
                    }

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
    try {
        const kafka = KafkaProducerSingleton.getInstance();

        // Register for 'user-events' topic
        kafka.registerHandler('result-topic', async ({ topic, partition, message, key }) => {
            console.log(`Processing user event: ${message.value.toString()}`);
            const data = JSON.parse(message.value.toString());
            await updateSubmissionStatus(data.submissionId, data);
            const time = new Date().toISOString()
            console.log(`[${time}] update submission status:`, data.submissionId);
        });

        // Register for AI recommendation topic
        kafka.registerHandler('ai_response', async ({ topic, partition, message }) => {
            console.log(`Received AI Hint: ${message.value.toString()}`);
            const data = JSON.parse(message.value.toString());
            const generatedAt = data.generatedAt ? new Date(data.generatedAt) : new Date();
            const receivedAt = new Date();

            let problemShortId = data.problemShortId || null;
            if (!problemShortId && data.problemId) {
                const problem = await problemModels.findById(data.problemId).select('shortId');
                problemShortId = problem?.shortId || null;
            }

            try {
                await aiConversationModel.findOneAndUpdate(
                    {
                        user: data.userId,
                        problem: data.problemId,
                    },
                    {
                        $setOnInsert: {
                            user: data.userId,
                            problem: data.problemId,
                        },
                        $set: {
                            lastMessageAt: receivedAt,
                        },
                        $push: {
                            messages: {
                                role: 'assistant',
                                content: data.hint || '',
                                submission: data.submissionId || null,
                                source: data.source || null,
                                model: data.model || null,
                                errorType: data.errorType || null,
                                createdAt: generatedAt,
                            },
                        },
                    },
                    { upsert: true, new: true }
                );
            } catch (saveError) {
                console.error('Failed to persist AI conversation message:', saveError);
            }
            
            const { sendMessageToUser } = await import('../socket/socket.js');
            sendMessageToUser(data.userId, 'HINT_READY', {
                submissionId: data.submissionId,
                problemId: data.problemId,
                problemShortId,
                hint: data.hint,
                source: data.source || null,
                model: data.model || null,
                errorType: data.errorType || null,
                generatedAt: generatedAt.toISOString(),
                receivedAt: receivedAt.toISOString(),
            });
            console.log(`[AI Hint] forwarded via socket to user: ${data.userId}`);
        });

        // Subscribe tất cả topics
        await kafka.subscribe(['result-topic', 'ai_response']);
    }
    catch (err) {
        console.error(err);
    }
};