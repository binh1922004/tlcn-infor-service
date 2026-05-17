import response from "../helpers/response.js";
import testCasePlanModel from "../models/testCasePlan.model.js";
import { sendMessage } from "../service/kafka.service.js";
import { log, logError } from "../utils/logger.js";

const TOPIC_REQUEST = "test-case-plan-request";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const parseNumberOfTestCases = (value, fallback = 5) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1 || n > 50) return fallback;
    return Math.floor(n);
};

// ---------------------------------------------------------------------------
// POST /api/test-case/plan
// ---------------------------------------------------------------------------

export const createTestCasePlan = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { statement, inputConstraint = "", outputConstraint = "", numberOfTestCases } = req.body;

        if (!statement || String(statement).trim() === "") {
            return response.sendError(res, "statement is required", 400);
        }

        const resolvedCount = parseNumberOfTestCases(numberOfTestCases, 5);

        // Create the workflow document in pending state
        const plan = await testCasePlanModel.create({
            userId,
            statement: String(statement).trim(),
            inputConstraint: String(inputConstraint).trim(),
            outputConstraint: String(outputConstraint).trim(),
            numberOfTestCases: resolvedCount,
            status: "pending",
            versions: [],
        });

        const workflowId = plan._id.toString();

        // Publish Kafka request to AI service
        await sendMessage(TOPIC_REQUEST, {
            workflowId,
            userId,
            statement: plan.statement,
            inputConstraint: plan.inputConstraint,
            outputConstraint: plan.outputConstraint,
            numberOfTestCases: resolvedCount,
        });

        log(`[TestCasePlan] Created workflowId=${workflowId} | n=${resolvedCount} | userId=${userId}`);

        return response.sendSuccess(
            res,
            { workflowId, status: "pending", numberOfTestCases: resolvedCount },
            "Test case plan generation queued",
            202
        );
    } catch (error) {
        logError("[TestCasePlan] createTestCasePlan error:", error);
        return response.sendError(res, error.message || "Failed to create test case plan", 500, error);
    }
};

// ---------------------------------------------------------------------------
// PUT /api/test-case/plan/:workflowId  (regenerate)
// ---------------------------------------------------------------------------

export const regenerateTestCasePlan = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { workflowId } = req.params;
        const { statement, inputConstraint, outputConstraint, numberOfTestCases } = req.body;

        const plan = await testCasePlanModel.findById(workflowId);
        if (!plan) {
            return response.sendError(res, "Test case plan not found", 404);
        }
        if (plan.userId.toString() !== userId.toString()) {
            return response.sendError(res, "Access denied", 403);
        }

        // Override only the fields the client provides, fall back to stored values
        const effectiveStatement      = statement      !== undefined ? String(statement).trim()      : plan.statement;
        const effectiveInput          = inputConstraint !== undefined ? String(inputConstraint).trim() : plan.inputConstraint;
        const effectiveOutput         = outputConstraint !== undefined ? String(outputConstraint).trim() : plan.outputConstraint;
        const effectiveCount          = numberOfTestCases !== undefined
            ? parseNumberOfTestCases(numberOfTestCases, plan.numberOfTestCases)
            : plan.numberOfTestCases;

        if (!effectiveStatement) {
            return response.sendError(res, "statement is required", 400);
        }

        // Persist any overridden values & reset status
        plan.statement          = effectiveStatement;
        plan.inputConstraint    = effectiveInput;
        plan.outputConstraint   = effectiveOutput;
        plan.numberOfTestCases  = effectiveCount;
        plan.status             = "pending";
        await plan.save();

        // Publish Kafka request
        await sendMessage(TOPIC_REQUEST, {
            workflowId,
            userId,
            statement: effectiveStatement,
            inputConstraint: effectiveInput,
            outputConstraint: effectiveOutput,
            numberOfTestCases: effectiveCount,
        });

        log(`[TestCasePlan] Regenerate workflowId=${workflowId} | n=${effectiveCount} | userId=${userId}`);

        return response.sendSuccess(
            res,
            { workflowId, status: "pending", numberOfTestCases: effectiveCount },
            "Test case plan regeneration queued",
            202
        );
    } catch (error) {
        logError("[TestCasePlan] regenerateTestCasePlan error:", error);
        return response.sendError(res, error.message || "Failed to regenerate test case plan", 500, error);
    }
};

// ---------------------------------------------------------------------------
// GET /api/test-case/plan/:workflowId
// ---------------------------------------------------------------------------

export const getTestCasePlan = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { workflowId } = req.params;

        const plan = await testCasePlanModel.findById(workflowId).lean();
        if (!plan) {
            return response.sendError(res, "Test case plan not found", 404);
        }
        if (plan.userId.toString() !== userId.toString()) {
            return response.sendError(res, "Access denied", 403);
        }

        return response.sendSuccess(res, plan);
    } catch (error) {
        logError("[TestCasePlan] getTestCasePlan error:", error);
        return response.sendError(res, error.message || "Failed to fetch test case plan", 500, error);
    }
};

// ---------------------------------------------------------------------------
// GET /api/test-case/plan  (list user's plans)
// ---------------------------------------------------------------------------

export const listTestCasePlans = async (req, res) => {
    try {
        const userId = req.user?._id;
        const page  = Math.max(1, Number(req.query.page)  || 1);
        const limit = Math.min(50, Number(req.query.limit) || 10);
        const skip  = (page - 1) * limit;

        const [plans, total] = await Promise.all([
            testCasePlanModel
                .find({ userId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .select("_id status numberOfTestCases statement createdAt updatedAt versions")
                .lean(),
            testCasePlanModel.countDocuments({ userId }),
        ]);

        return response.sendSuccess(res, {
            plans,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        logError("[TestCasePlan] listTestCasePlans error:", error);
        return response.sendError(res, error.message || "Failed to list test case plans", 500, error);
    }
};
