import response from "../helpers/response.js";
import testCasePlanModel from "../models/testCasePlan.model.js";
import testCaseCodeModel from "../models/testCaseCode.model.js";
import { sendMessage } from "../service/kafka.service.js";
import { log, logError } from "../utils/logger.js";
import { config } from "../../config/env.js";

const TOPIC_REQUEST = config.kafka_topics.ai_test_case_code_request;

// ---------------------------------------------------------------------------
// POST /api/test-case/code-generate/:workflowId
// ---------------------------------------------------------------------------

export const createTestCaseCode = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { workflowId } = req.params;

        // 1. Fetch the parent test-case plan
        const plan = await testCasePlanModel.findById(workflowId).lean();
        if (!plan) {
            return response.sendError(res, "Test case plan not found", 404);
        }
        if (plan.userId.toString() !== userId.toString()) {
            return response.sendError(res, "Access denied", 403);
        }
        if (plan.status !== "done") {
            return response.sendError(
                res,
                "Test case plan must be completed before generating code",
                400
            );
        }

        // 2. Resolve the latest version's categories
        const latestVersion = plan.versions?.[plan.versions.length - 1];
        if (!latestVersion || !latestVersion.categories?.length) {
            return response.sendError(
                res,
                "Plan has no categories — regenerate the plan first",
                400
            );
        }

        // 3. Create or find existing TestCaseCode doc (upsert)
        let codeDoc = await testCaseCodeModel.findOne({ planId: workflowId, userId });

        if (codeDoc) {
            // Already exists — reset status
            codeDoc.status = "pending";
            await codeDoc.save();
        } else {
            codeDoc = await testCaseCodeModel.create({
                planId: workflowId,
                userId,
                language: "python",
                status: "pending",
                versions: [],
            });
        }

        // 4. Publish Kafka request
        await sendMessage(TOPIC_REQUEST, {
            workflowId,
            userId,
            statement: plan.statement,
            inputConstraint: plan.inputConstraint,
            outputConstraint: plan.outputConstraint,
            language: "python",
            categories: latestVersion.categories,
        });

        log(`[TestCaseCode] Created code-gen for planId=${workflowId} | userId=${userId}`);

        return response.sendSuccess(
            res,
            { workflowId, status: "pending" },
            "Test case code generation queued",
            202
        );
    } catch (error) {
        logError("[TestCaseCode] createTestCaseCode error:", error);
        return response.sendError(res, error.message || "Failed to create test case code", 500, error);
    }
};

// ---------------------------------------------------------------------------
// PUT /api/test-case/code-generate/:workflowId  (regenerate with feedback)
// ---------------------------------------------------------------------------

export const regenerateTestCaseCode = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { workflowId } = req.params;
        const { feedback } = req.body;

        // 1. Fetch parent plan
        const plan = await testCasePlanModel.findById(workflowId).lean();
        if (!plan) {
            return response.sendError(res, "Test case plan not found", 404);
        }
        if (plan.userId.toString() !== userId.toString()) {
            return response.sendError(res, "Access denied", 403);
        }

        // 2. Fetch existing code doc
        const codeDoc = await testCaseCodeModel.findOne({ planId: workflowId, userId });
        if (!codeDoc) {
            return response.sendError(
                res,
                "No code generation found for this plan — create one first",
                404
            );
        }

        // 3. Resolve latest plan categories
        const latestVersion = plan.versions?.[plan.versions.length - 1];
        if (!latestVersion || !latestVersion.categories?.length) {
            return response.sendError(
                res,
                "Plan has no categories — regenerate the plan first",
                400
            );
        }

        // 4. Get the previous code version for context (so AI can improve on it)
        const previousVersion = codeDoc.versions?.[codeDoc.versions.length - 1];

        // 5. Reset status
        codeDoc.status = "pending";
        await codeDoc.save();

        // 6. Publish Kafka request with feedback + previous code
        await sendMessage(TOPIC_REQUEST, {
            workflowId,
            userId,
            statement: plan.statement,
            inputConstraint: plan.inputConstraint,
            outputConstraint: plan.outputConstraint,
            language: codeDoc.language,
            categories: latestVersion.categories,
            feedback: feedback ? String(feedback).trim() : null,
            previousInputCode: previousVersion?.inputCode || null,
            previousOutputCode: previousVersion?.outputCode || null,
        });

        log(`[TestCaseCode] Regenerate code for planId=${workflowId} | feedback=${!!feedback} | userId=${userId}`);

        return response.sendSuccess(
            res,
            { workflowId, status: "pending", hasFeedback: !!feedback },
            "Test case code regeneration queued",
            202
        );
    } catch (error) {
        logError("[TestCaseCode] regenerateTestCaseCode error:", error);
        return response.sendError(res, error.message || "Failed to regenerate test case code", 500, error);
    }
};

// ---------------------------------------------------------------------------
// GET /api/test-case/code-generate/:workflowId
// ---------------------------------------------------------------------------

export const getTestCaseCode = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { workflowId } = req.params;

        const codeDoc = await testCaseCodeModel.findOne({ planId: workflowId, userId }).lean();
        if (!codeDoc) {
            return response.sendError(res, "Test case code not found", 404);
        }
        if (codeDoc.userId.toString() !== userId.toString()) {
            return response.sendError(res, "Access denied", 403);
        }

        return response.sendSuccess(res, codeDoc);
    } catch (error) {
        logError("[TestCaseCode] getTestCaseCode error:", error);
        return response.sendError(res, error.message || "Failed to fetch test case code", 500, error);
    }
};

// ---------------------------------------------------------------------------
// GET /api/test-case/code-generate  (list user's code generations)
// ---------------------------------------------------------------------------

export const listTestCaseCodes = async (req, res) => {
    try {
        const userId = req.user?._id;
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(50, Number(req.query.limit) || 10);
        const skip = (page - 1) * limit;

        const [codes, total] = await Promise.all([
            testCaseCodeModel
                .find({ userId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .select("_id planId status language createdAt updatedAt versions")
                .lean(),
            testCaseCodeModel.countDocuments({ userId }),
        ]);

        return response.sendSuccess(res, {
            codes,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        logError("[TestCaseCode] listTestCaseCodes error:", error);
        return response.sendError(res, error.message || "Failed to list test case codes", 500, error);
    }
};

// ---------------------------------------------------------------------------
// POST /api/test-case/execute/:workflowId
// ---------------------------------------------------------------------------

export const executeTestCaseCode = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { workflowId } = req.params;
        const { version } = req.body;

        const codeDoc = await testCaseCodeModel.findOne({ planId: workflowId, userId });
        if (!codeDoc) {
            return response.sendError(
                res,
                "No code generation found for this plan",
                404
            );
        }

        if (codeDoc.status !== "done") {
             return response.sendError(
                 res,
                 "Code generation must be completed before execution",
                 400
             );
        }

        let targetVersion = null;
        if (version) {
            targetVersion = codeDoc.versions.find(v => v.versionNumber === Number(version));
        } else {
            targetVersion = codeDoc.versions?.[codeDoc.versions.length - 1];
        }

        if (!targetVersion) {
            return response.sendError(
                res,
                "Specific version not found or no versions available",
                404
            );
        }

        if (!targetVersion.inputCode && !targetVersion.outputCode) {
            return response.sendError(
                res,
                "Target version has no executable code",
                400
            );
        }

        await sendMessage(config.kafka_topics.compiler_test_case_generation_request, {
            planId: workflowId,
            version: targetVersion.versionNumber,
            inputCode: targetVersion.inputCode,
            outPutCode: targetVersion.outputCode,
        });

        log(`[TestCaseCode] Executing code for planId=${workflowId} | version=${targetVersion.versionNumber} | userId=${userId}`);

        return response.sendSuccess(
            res,
            { workflowId, version: targetVersion.versionNumber, status: "pending" },
            "Test case execution queued",
            202
        );
    } catch (error) {
        logError("[TestCaseCode] executeTestCaseCode error:", error);
        return response.sendError(res, error.message || "Failed to execute test case code", 500, error);
    }
};
