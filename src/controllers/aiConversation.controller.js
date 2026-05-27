import mongoose from "mongoose";
import response from "../helpers/response.js";
import aiConversationModel from "../models/aiConversation.model.js";
import problemModels from "../models/problem.models.js";
import SubmissionModel from "../models/submission.model.js";
import userModel from "../models/user.models.js";
import { sendMessage } from "../service/kafka.service.js";
import { Status } from "../utils/statusType.js";

const AI_HINT_THRESHOLD = 3;
const AI_HINT_FAILED_STATUSES = [Status.WA, Status.TLE];

const resolveProblem = async (problemRef, projection = "_id shortId name") => {
    if (mongoose.Types.ObjectId.isValid(problemRef)) {
        return await problemModels.findById(problemRef).select(projection);
    }
    return await problemModels.findOne({ shortId: problemRef }).select(projection);
};

const buildAiHintEligibility = async ({ userId, problem, aiHintEnabled }) => {
    // Check if user already solved this problem (Accepted)
    const hasSolved = await SubmissionModel.exists({
        user: userId,
        problem: problem._id,
        status: "Accepted",
    });

    if (hasSolved) {
        return {
            problemId: problem._id,
            problemShortId: problem.shortId || null,
            failedCount: 0,
            threshold: AI_HINT_THRESHOLD,
            aiHintEnabled,
            hasSolved: true,
            isEligible: false,
        };
    }

    const failedCount = await SubmissionModel.countDocuments({
        user: userId,
        problem: problem._id,
        status: { $in: AI_HINT_FAILED_STATUSES },
    });

    const isEligibleByAttempts = failedCount >= AI_HINT_THRESHOLD;
    return {
        problemId: problem._id,
        problemShortId: problem.shortId || null,
        failedCount,
        threshold: AI_HINT_THRESHOLD,
        aiHintEnabled,
        hasSolved: false,
        isEligible: aiHintEnabled && isEligibleByAttempts,
    };
};

export const getAiHintEligibilityByProblem = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { problemRef } = req.params;

        const currentUser = await userModel.findById(userId).select("aiHintEnabled");
        if (!currentUser) {
            return response.sendError(res, "User not found", 404);
        }

        const problem = await resolveProblem(problemRef);
        if (!problem) {
            return response.sendError(res, "Problem not found", 404);
        }

        const aiHintEnabled = currentUser.aiHintEnabled !== false;
        const eligibility = await buildAiHintEligibility({
            userId,
            problem,
            aiHintEnabled,
        });

        return response.sendSuccess(res, eligibility);
    } catch (error) {
        console.error(error);
        return response.sendError(res, error.message || "Failed to check AI hint eligibility", 500, error);
    }
};

export const getConversationByProblem = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { problemRef } = req.params;

        const currentUser = await userModel.findById(userId).select("aiHintEnabled");
        if (!currentUser) {
            return response.sendError(res, "User not found", 404);
        }
        if (currentUser.aiHintEnabled === false) {
            return response.sendError(res, "AI Hint is disabled in your privacy settings", 403);
        }

        const problem = await resolveProblem(problemRef);
        if (!problem) {
            return response.sendError(res, "Problem not found", 404);
        }

        const conversation = await aiConversationModel
            .findOne({ user: userId, problem: problem._id })
            .lean();

        if (!conversation) {
            return response.sendSuccess(res, {
                problem: {
                    _id: problem._id,
                    shortId: problem.shortId,
                    name: problem.name,
                },
                messages: [],
            });
        }

        return response.sendSuccess(res, {
            ...conversation,
            problem: {
                _id: problem._id,
                shortId: problem.shortId,
                name: problem.name,
            },
        });
    } catch (error) {
        console.error(error);
        return response.sendError(res, error.message || "Failed to fetch AI conversation", 500, error);
    }
};

export const addUserMessage = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { problemRef } = req.params;
        const { content, submissionId = null } = req.body;

        const currentUser = await userModel.findById(userId).select("aiHintEnabled");
        if (!currentUser) {
            return response.sendError(res, "User not found", 404);
        }
        if (currentUser.aiHintEnabled === false) {
            return response.sendError(res, "AI Hint is disabled in your privacy settings", 403);
        }

        if (!content || String(content).trim() === "") {
            return response.sendError(res, "Message content is required", 400);
        }

        const problem = await resolveProblem(problemRef);
        if (!problem) {
            return response.sendError(res, "Problem not found", 404);
        }

        const now = new Date();
        const messagePayload = {
            role: "user",
            content: String(content).trim(),
            submission: submissionId,
            createdAt: now,
        };

        const conversation = await aiConversationModel.findOneAndUpdate(
            { user: userId, problem: problem._id },
            {
                $setOnInsert: {
                    user: userId,
                    problem: problem._id,
                },
                $set: {
                    lastMessageAt: now,
                },
                $push: {
                    messages: messagePayload,
                },
            },
            { upsert: true, new: true }
        );

        return response.sendSuccess(res, conversation, "User message saved", 201);
    } catch (error) {
        console.error(error);
        return response.sendError(res, error.message || "Failed to save user message", 500, error);
    }
};

export const markConversationViewed = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { problemRef } = req.params;

        const problem = await resolveProblem(problemRef);
        if (!problem) {
            return response.sendError(res, "Problem not found", 404);
        }

        const conversation = await aiConversationModel.findOneAndUpdate(
            { user: userId, problem: problem._id },
            {
                $set: {
                    lastViewedAt: new Date(),
                },
            },
            { new: true }
        );

        return response.sendSuccess(res, conversation);
    } catch (error) {
        console.error(error);
        return response.sendError(res, error.message || "Failed to mark conversation viewed", 500, error);
    }
};

const AI_HINT_COOLDOWN_MS = 30 * 1000; // 30 seconds between requests
const AI_HINT_DAILY_CAP = 10;           // max 10 hint requests per user per problem per day

export const requestFollowUpHint = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { problemRef } = req.params;
        const { sourceCode, language, question = "", submissionId = null } = req.body || {};

        const currentUser = await userModel.findById(userId).select("aiHintEnabled");
        if (!currentUser) {
            return response.sendError(res, "User not found", 404);
        }
        if (currentUser.aiHintEnabled === false) {
            return response.sendError(res, "AI Hint is disabled in your privacy settings", 403);
        }

        if (!sourceCode || String(sourceCode).trim() === "") {
            return response.sendError(res, "sourceCode is required", 400);
        }

        const normalizedLanguage = String(language || "").trim();
        if (!normalizedLanguage) {
            return response.sendError(res, "language is required", 400);
        }

        const problem = await resolveProblem(
            problemRef,
            "_id shortId name statement input output examplesInput examplesOutput"
        );
        if (!problem) {
            return response.sendError(res, "Problem not found", 404);
        }

        const eligibility = await buildAiHintEligibility({
            userId,
            problem,
            aiHintEnabled: currentUser.aiHintEnabled !== false,
        });
        if (!eligibility.isEligible) {
            const reason = eligibility.hasSolved
                ? "Ban da hoan thanh bai nay. AI Hint khong kha dung cho bai da giai thanh cong."
                : "AI Hint is not unlocked for this problem yet";
            return response.sendError(res, reason, 403);
        }

        // --- Rate Limit: Cooldown 30s ---
        const existingConversation = await aiConversationModel
            .findOne({ user: userId, problem: problem._id })
            .select("messages")
            .lean();

        if (existingConversation?.messages?.length > 0) {
            const lastUserMessage = [...existingConversation.messages]
                .reverse()
                .find((msg) => msg.role === "user" && msg.source === "follow_up_request");

            if (lastUserMessage?.createdAt) {
                const elapsed = Date.now() - new Date(lastUserMessage.createdAt).getTime();
                if (elapsed < AI_HINT_COOLDOWN_MS) {
                    const waitSeconds = Math.ceil((AI_HINT_COOLDOWN_MS - elapsed) / 1000);
                    return response.sendError(
                        res,
                        `Vui long doi ${waitSeconds} giay truoc khi yeu cau goi y tiep theo.`,
                        429
                    );
                }
            }

            // --- Rate Limit: Daily Cap ---
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const todayRequestCount = existingConversation.messages.filter(
                (msg) =>
                    msg.role === "user" &&
                    msg.source === "follow_up_request" &&
                    msg.createdAt &&
                    new Date(msg.createdAt) >= todayStart
            ).length;

            if (todayRequestCount >= AI_HINT_DAILY_CAP) {
                return response.sendError(
                    res,
                    `Ban da dat gioi han ${AI_HINT_DAILY_CAP} yeu cau goi y cho bai nay trong ngay hom nay.`,
                    429
                );
            }
        }

        const normalizedSubmissionId =
            submissionId && mongoose.Types.ObjectId.isValid(submissionId) ? submissionId : null;
        const cleanedQuestion = String(question || "").trim();
        const userMessageContent =
            cleanedQuestion || "Xin them goi y tiep theo dua tren doan code hien tai cua em.";
        const now = new Date();

        const conversation = await aiConversationModel.findOneAndUpdate(
            { user: userId, problem: problem._id },
            {
                $setOnInsert: {
                    user: userId,
                    problem: problem._id,
                },
                $set: {
                    lastMessageAt: now,
                },
                $push: {
                    messages: {
                        role: "user",
                        content: userMessageContent,
                        submission: normalizedSubmissionId,
                        source: "follow_up_request",
                        createdAt: now,
                    },
                },
            },
            { upsert: true, new: true }
        );

        const conversationContext = (conversation?.messages || [])
            .slice(-4)
            .map((msg) => ({
                role: msg.role,
                content: String(msg.content || "").slice(0, 2000),
                createdAt: msg.createdAt,
            }));

        await sendMessage("ai_request", {
            userId,
            submissionId: normalizedSubmissionId,
            problemId: problem._id,
            problemShortId: problem.shortId || null,
            problemTitle: problem.name || "Unknown problem",
            problemStatement: problem.statement || "",
            problemInput: problem.input || "",
            problemOutput: problem.output || "",
            examplesInput: Array.isArray(problem.examplesInput) ? problem.examplesInput : [],
            examplesOutput: Array.isArray(problem.examplesOutput) ? problem.examplesOutput : [],
            sourceCode: String(sourceCode),
            language: normalizedLanguage,
            failedReason: "FOLLOW_UP_REQUEST",
            userQuestion: cleanedQuestion || null,
            conversationContext,
        });

        return response.sendSuccess(
            res,
            {
                queued: true,
                problem: {
                    _id: problem._id,
                    shortId: problem.shortId,
                    name: problem.name,
                },
            },
            "AI hint request queued",
            202
        );
    } catch (error) {
        console.error(error);
        return response.sendError(res, error.message || "Failed to request follow-up hint", 500, error);
    }
};
