import response from "../helpers/response.js";
import { sendMessage } from "../service/kafka.service.js";
import { config } from "../../config/env.js";
import redisClient from "../utils/redisClient.js";
import { v4 as uuidv4 } from "uuid";

const languages = ["cpp", "py", "java", "js", "c", "csharp", "go", "swift", "pl", "rb"];
const DEFAULT_TIME_LIMIT = 1;   // seconds
const DEFAULT_MEMORY_LIMIT = 128; // MB

/**
 * POST /api/pretest
 *
 * Accepts the user's source code, language, a single custom input string,
 * and the expected output string. Publishes a pre-test job to Kafka and caches in Redis.
 *
 * Returns 202 Accepted with { preTestId, status: "Pending" }.
 * The result is delivered asynchronously via WebSocket (PRE_TEST_RESULT event).
 */
export const runPreTest = async (req, res) => {
    try {
        const userId = req.user._id;
        const problemId = req.body.problemId || req.params.id;
        const { source, language, input, expectedOutput, timeLimit, memoryLimit } = req.body;

        // Validate required fields
        if (!source || source.trim() === "") {
            return response.sendError(res, "Source code cannot be empty", 400);
        }
        if (!language || !languages.includes(language)) {
            return response.sendError(res, `Language must be one of: ${languages.join(", ")}`, 400);
        }
        if (input === undefined || input === null) {
            return response.sendError(res, "Input is required", 400);
        }
        if (expectedOutput === undefined || expectedOutput === null || expectedOutput.trim() === "") {
            return response.sendError(res, "Expected output is required", 400);
        }

        const preTestId = uuidv4();

        // Cache initial pending status in Redis with 10 minute TTL (600 seconds)
        await redisClient.setEx(`pretest:${preTestId}`, 600, JSON.stringify({
            preTestId,
            userId: userId.toString(),
            problemId: problemId || null,
            status: "Pending",
            createdAt: new Date().toISOString()
        }));

        const message = {
            _id: preTestId,
            userId: userId.toString(),
            source: source.trim(),
            language,
            input,
            expectedOutput,
            timeLimit: timeLimit || DEFAULT_TIME_LIMIT,
            memoryLimit: memoryLimit || DEFAULT_MEMORY_LIMIT,
            problemId: problemId || null,
        };

        await sendMessage(config.kafka_topics.compiler_pre_test_request, message);

        return res.status(202).json({
            success: true,
            data: {
                preTestId,
                status: "Pending",
            },
        });
    } catch (error) {
        console.error("[PreTest] Error submitting pre-test:", error);
        return response.sendError(res, error);
    }
};

/**
 * GET /api/pretest/:id
 * Retrieve cached pre-test status from Redis.
 */
export const getPreTestStatus = async (req, res) => {
    try {
        const preTestId = req.params.id;
        if (!preTestId) {
            return response.sendError(res, "preTestId is required", 400);
        }
        const data = await redisClient.get(`pretest:${preTestId}`);
        if (!data) {
            return response.sendError(res, "Pre-test result not found or expired", 404);
        }
        return res.status(200).json({
            success: true,
            data: JSON.parse(data)
        });
    } catch (error) {
        console.error("[PreTest] Error getting pre-test status:", error);
        return response.sendError(res, error);
    }
};
