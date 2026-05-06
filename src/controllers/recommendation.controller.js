import mongoose from "mongoose";
import response from "../helpers/response.js";
import SubmissionModel from "../models/submission.model.js";
import problemModels from "../models/problem.models.js";
import UserSkillMastery from "../models/userSkillMastery.model.js";
import { MASTERY_THRESHOLD } from "../utils/bkt.engine.js";

const FAILED_STATUSES = ["Wrong Answer", "Time Limit Exceeded", "Runtime Error", "Memory Limit Exceeded"];
const DEFAULT_LIMIT = 5;

/**
 * GET /recommendations/problems?limit=5
 *
 * Phiên bản nâng cấp BKT:
 * 1. Ưu tiên: Weak skills từ BKT (P(L) thấp nhất)
 * 2. Loại bài đã AC, ưu tiên bài phù hợp trình độ
 */
export const getRecommendedProblems = async (req, res) => {
    try {
        const userId = req.user?._id;
        const limit = Math.min(Math.max(Number(req.query.limit) || DEFAULT_LIMIT, 1), 20);

        if (!userId) {
            return response.sendError(res, "Authentication required", 401);
        }

        // ─── 1. Lấy BKT skill mastery data ───
        const masteries = await UserSkillMastery.find({ userId })
            .select("tagName pLearned totalAttempts")
            .sort({ pLearned: 1 }) // Weak skills first
            .lean();

        // ─── 2. Tìm bài user đã submit sai, populate tags ───
        const failedSubmissions = await SubmissionModel.find({
            user: userId,
            status: { $in: FAILED_STATUSES },
        })
            .select("problem")
            .lean();

        // ─── 3. Build weak tags ───
        let weakTags = [];
        let weakTagNames = [];

        if (masteries.length > 0) {
            // BKT-based: tags chưa mastered, sort theo P(L) tăng dần
            weakTags = masteries
                .filter((m) => m.pLearned < MASTERY_THRESHOLD)
                .map((m) => ({
                    tag: m.tagName,
                    pLearned: Math.round(m.pLearned * 10000) / 10000,
                    masteryPercent: Math.round(m.pLearned * 100),
                    totalAttempts: m.totalAttempts,
                    source: "bkt",
                }));

            weakTagNames = weakTags.map((t) => t.tag);
        }


        if (weakTagNames.length === 0) {
            return response.sendSuccess(res, {
                weakTags: [],
                recommendations: [],
                message: "Chưa có dữ liệu để phân tích. Hãy giải thêm bài!",
            });
        }

        // ─── 4. Tìm bài user đã Accepted (để loại trừ) ───
        const acceptedSubmissions = await SubmissionModel.find({
            user: userId,
            status: "Accepted",
        })
            .select("problem")
            .lean();

        const acceptedProblemIds = [
            ...new Set(acceptedSubmissions.map((s) => String(s.problem))),
        ];

        // ─── 5. Lấy unique problem IDs từ failed submissions (để đánh dấu retry) ───
        const failedProblemIdSet = new Set(
            failedSubmissions.map((s) => String(s.problem))
        );

        // ─── 6. Query bài đề xuất ───
        // Chỉ loại bài đã AC; bài đang fail vẫn được đề xuất lại (isRetry)
        const excludeIds = acceptedProblemIds
            .map((id) => new mongoose.Types.ObjectId(id));

        const candidates = await problemModels
            .find({
                tags: { $in: weakTagNames },
                isActive: true,
                isPrivate: false,
                classRoom: null,            // Chỉ bài công khai
                _id: { $nin: excludeIds },  // Loại bài đã AC
            })
            .select("name shortId tags difficulty numberOfSubmissions numberOfAccepted rating")
            .lean();

        // ─── 7. Build mastery map cho scoring ───
        const masteryMap = {};
        for (const m of masteries) {
            masteryMap[m.tagName] = m.pLearned;
        }

        // ─── 8. Tính relevance score + sort ───
        const scored = candidates.map((problem) => {
            const problemTags = Array.isArray(problem.tags) ? problem.tags : [];

            // Tags trùng với weak tags
            const matchedTags = problemTags.filter((t) => weakTagNames.includes(t));
            const tagScore = matchedTags.length;

            // BKT-based weakness score: 1 - min(P(L) của matched tags)
            let bktWeaknessScore = 0;
            if (Object.keys(masteryMap).length > 0 && matchedTags.length > 0) {
                const matchedMasteries = matchedTags
                    .map((t) => masteryMap[t])
                    .filter((p) => p !== undefined);
                if (matchedMasteries.length > 0) {
                    bktWeaknessScore = 1 - Math.min(...matchedMasteries);
                }
            }

            // Ưu tiên bài có rating thấp (dễ hơn) – rating default 100, max ~1000
            // ratingScore: bài rating 100 → 9, bài rating 1000 → 0
            const rating = problem.rating || 100;
            const ratingScore = Math.max(0, (1000 - rating) / 100);

            // Acceptance rate
            const totalSubs = problem.numberOfSubmissions || 0;
            const acceptedSubs = problem.numberOfAccepted || 0;
            const acceptanceRate = totalSubs > 0 ? acceptedSubs / totalSubs : 0;

            // Bonus cho bài user đã thử nhưng chưa AC (retry)
            const isRetry = failedProblemIdSet.has(String(problem._id));
            const retryBonus = isRetry ? 50 : 0;

            // Combined score: BKT weakness > tag match > retry bonus > rating > acceptance rate
            const score =
                bktWeaknessScore * 200 +
                tagScore * 100 +
                retryBonus +
                ratingScore * 10 +
                acceptanceRate * 5;

            // Reason text with mastery info
            const topMatchedTag = matchedTags.sort((a, b) => {
                const pA = masteryMap[a] ?? 1;
                const pB = masteryMap[b] ?? 1;
                return pA - pB; // Weakest first
            })[0];

            const topMastery = masteryMap[topMatchedTag];
            let reason;
            if (topMastery !== undefined) {
                reason = `Luyện ${topMatchedTag} (thành thạo ${Math.round(topMastery * 100)}%)`;
            } else {
                reason = topMatchedTag ? `Luyện thêm ${topMatchedTag}` : "Bài tập phù hợp";
            }

            return {
                _id: problem._id,
                shortId: problem.shortId,
                name: problem.name,
                difficulty: problem.difficulty,
                rating: problem.rating || 100,
                tags: problemTags,
                matchedTags,
                isRetry,
                acceptanceRate: Math.round(acceptanceRate * 100),
                masteryInfo: matchedTags.reduce((acc, tag) => {
                    if (masteryMap[tag] !== undefined) {
                        acc[tag] = Math.round(masteryMap[tag] * 100);
                    }
                    return acc;
                }, {}),
                reason,
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
