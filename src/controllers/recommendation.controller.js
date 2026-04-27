import mongoose from "mongoose";
import response from "../helpers/response.js";
import SubmissionModel from "../models/submission.model.js";
import problemModels from "../models/problem.models.js";

const FAILED_STATUSES = ["Wrong Answer", "Time Limit Exceeded", "Runtime Error", "Memory Limit Exceeded"];
const DIFFICULTY_ORDER = { Easy: 1, Medium: 2, Hard: 3 };
const DEFAULT_LIMIT = 5;

/**
 * GET /recommendations/problems?limit=5
 *
 * Phân tích tags từ bài user submit sai → đề xuất bài cùng tag
 * mà user chưa Accepted, ưu tiên bài dễ hơn.
 */
export const getRecommendedProblems = async (req, res) => {
    try {
        const userId = req.user?._id;
        const limit = Math.min(Math.max(Number(req.query.limit) || DEFAULT_LIMIT, 1), 20);

        if (!userId) {
            return response.sendError(res, "Authentication required", 401);
        }

        // ─── 1. Tìm bài user đã submit sai, populate tags ───
        const failedSubmissions = await SubmissionModel.find({
            user: userId,
            status: { $in: FAILED_STATUSES },
        })
            .select("problem")
            .lean();

        if (failedSubmissions.length === 0) {
            return response.sendSuccess(res, {
                weakTags: [],
                recommendations: [],
                message: "Chưa có dữ liệu submission sai để phân tích.",
            });
        }

        // Lấy unique problem IDs từ submissions sai
        const failedProblemIds = [
            ...new Set(failedSubmissions.map((s) => String(s.problem))),
        ].map((id) => new mongoose.Types.ObjectId(id));

        // ─── 2. Lấy tags từ các bài sai ───
        const failedProblems = await problemModels
            .find({ _id: { $in: failedProblemIds } })
            .select("tags difficulty")
            .lean();

        // Đếm tần suất tag
        const tagCountMap = {};
        for (const problem of failedProblems) {
            if (!Array.isArray(problem.tags)) continue;
            for (const tag of problem.tags) {
                const normalizedTag = String(tag).trim();
                if (!normalizedTag) continue;
                tagCountMap[normalizedTag] = (tagCountMap[normalizedTag] || 0) + 1;
            }
        }

        if (Object.keys(tagCountMap).length === 0) {
            return response.sendSuccess(res, {
                weakTags: [],
                recommendations: [],
                message: "Các bài bạn sai chưa có tags để phân tích.",
            });
        }

        // Sắp xếp theo tần suất giảm dần
        const weakTags = Object.entries(tagCountMap)
            .map(([tag, failedCount]) => ({ tag, failedCount }))
            .sort((a, b) => b.failedCount - a.failedCount);

        const weakTagNames = weakTags.map((t) => t.tag);

        // ─── 3. Tìm bài user đã Accepted (để loại trừ) ───
        const acceptedSubmissions = await SubmissionModel.find({
            user: userId,
            status: "Accepted",
        })
            .select("problem")
            .lean();

        const acceptedProblemIds = [
            ...new Set(acceptedSubmissions.map((s) => String(s.problem))),
        ];

        // ─── 4. Query bài đề xuất ───
        const excludeIds = [
            ...acceptedProblemIds,
            ...failedProblemIds.map((id) => String(id)),
        ].map((id) => new mongoose.Types.ObjectId(id));

        const candidates = await problemModels
            .find({
                tags: { $in: weakTagNames },
                isActive: true,
                isPrivate: false,
                classRoom: null,                // Chỉ bài công khai
                _id: { $nin: excludeIds },       // Loại bài đã AC + đang fail
            })
            .select("name shortId tags difficulty numberOfSubmissions numberOfAccepted")
            .lean();

        // ─── 5. Tính relevance score + sort ───
        const scored = candidates.map((problem) => {
            const problemTags = Array.isArray(problem.tags) ? problem.tags : [];

            // Số tag trùng với weak tags
            const matchedTags = problemTags.filter((t) => weakTagNames.includes(t));
            const tagScore = matchedTags.length;

            // Ưu tiên bài dễ
            const diffOrder = DIFFICULTY_ORDER[problem.difficulty] || 2;
            const difficultyScore = 4 - diffOrder; // Easy=3, Medium=2, Hard=1

            // Acceptance rate
            const totalSubs = problem.numberOfSubmissions || 0;
            const acceptedSubs = problem.numberOfAccepted || 0;
            const acceptanceRate = totalSubs > 0 ? acceptedSubs / totalSubs : 0;

            // Combined score: tag match > difficulty > acceptance rate
            const score = tagScore * 100 + difficultyScore * 10 + acceptanceRate * 5;

            // Reason text
            const topMatchedTag = matchedTags.sort(
                (a, b) => (tagCountMap[b] || 0) - (tagCountMap[a] || 0)
            )[0];

            return {
                _id: problem._id,
                shortId: problem.shortId,
                name: problem.name,
                difficulty: problem.difficulty,
                tags: problemTags,
                matchedTags,
                acceptanceRate: Math.round(acceptanceRate * 100),
                reason: topMatchedTag
                    ? `Luyện thêm ${topMatchedTag}`
                    : "Bài tập phù hợp",
                _score: score,
            };
        });

        scored.sort((a, b) => b._score - a._score);
        const recommendations = scored.slice(0, limit).map(({ _score, ...rest }) => rest);

        return response.sendSuccess(res, {
            weakTags: weakTags.slice(0, 10),
            recommendations,
        });
    } catch (error) {
        console.error("[Recommendation] Error:", error);
        return response.sendError(
            res,
            error.message || "Failed to generate recommendations",
            500,
            error
        );
    }
};
