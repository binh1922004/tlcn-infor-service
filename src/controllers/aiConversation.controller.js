import mongoose from "mongoose";
import response from "../helpers/response.js";
import aiConversationModel from "../models/aiConversation.model.js";
import problemModels from "../models/problem.models.js";
import { sendMessage } from "../service/kafka.service.js";

const resolveProblem = async (problemRef, projection = "_id shortId name") => {
    if (mongoose.Types.ObjectId.isValid(problemRef)) {
        return await problemModels.findById(problemRef).select(projection);
    }
    return await problemModels.findOne({ shortId: problemRef }).select(projection);
};

export const getConversationByProblem = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { problemRef } = req.params;

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

export const requestFollowUpHint = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { problemRef } = req.params;
        const { sourceCode, language, question = "", submissionId = null } = req.body || {};

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
            .slice(-8)
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
