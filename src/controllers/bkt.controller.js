import response from "../helpers/response.js";
import UserSkillMastery from "../models/userSkillMastery.model.js";
import TagBKTProfile from "../models/tagBKTProfile.model.js";
import { seedTagProfiles, MASTERY_THRESHOLD } from "../utils/bkt.engine.js";

/**
 * GET /api/bkt/mastery
 * Trả P(L) tất cả tags của user hiện tại.
 * Hỗ trợ query: ?sort=asc|desc (theo pLearned)
 */
export const getUserSkillMastery = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return response.sendError(res, "Authentication required", 401);
    }

    const sort = req.query.sort === "asc" ? 1 : -1;

    const masteries = await UserSkillMastery.find({ userId })
      .select("tagName pLearned totalAttempts correctAttempts lastUpdated")
      .sort({ pLearned: sort })
      .lean();

    const result = masteries.map((m) => ({
      tagName: m.tagName,
      pLearned: Math.round(m.pLearned * 10000) / 10000,
      masteryPercent: Math.round(m.pLearned * 100),
      isMastered: m.pLearned >= MASTERY_THRESHOLD,
      totalAttempts: m.totalAttempts,
      correctAttempts: m.correctAttempts,
      accuracy:
        m.totalAttempts > 0
          ? Math.round((m.correctAttempts / m.totalAttempts) * 100)
          : 0,
      lastUpdated: m.lastUpdated,
    }));

    const stats = {
      totalSkills: result.length,
      masteredSkills: result.filter((r) => r.isMastered).length,
      averageMastery:
        result.length > 0
          ? Math.round(
              (result.reduce((sum, r) => sum + r.pLearned, 0) /
                result.length) *
                100
            )
          : 0,
    };

    return response.sendSuccess(res, { skills: result, stats });
  } catch (error) {
    console.error("[BKT] getUserSkillMastery error:", error);
    return response.sendError(
      res,
      error.message || "Failed to get skill mastery",
      500,
      error
    );
  }
};

/**
 * GET /api/bkt/mastery/:userId
 * Trả P(L) tất cả tags của user khác (public profile).
 */
export const getUserSkillMasteryByUserId = async (req, res) => {
  try {
    const userId = req.params.userId;
    if (!userId) {
      return response.sendError(res, "User ID is required", 400);
    }

    const masteries = await UserSkillMastery.find({ userId })
      .select("tagName pLearned totalAttempts correctAttempts lastUpdated")
      .sort({ pLearned: -1 })
      .lean();

    const result = masteries.map((m) => ({
      tagName: m.tagName,
      pLearned: Math.round(m.pLearned * 10000) / 10000,
      masteryPercent: Math.round(m.pLearned * 100),
      isMastered: m.pLearned >= MASTERY_THRESHOLD,
      totalAttempts: m.totalAttempts,
      correctAttempts: m.correctAttempts,
      accuracy:
        m.totalAttempts > 0
          ? Math.round((m.correctAttempts / m.totalAttempts) * 100)
          : 0,
      lastUpdated: m.lastUpdated,
    }));

    const stats = {
      totalSkills: result.length,
      masteredSkills: result.filter((r) => r.isMastered).length,
      averageMastery:
        result.length > 0
          ? Math.round(
              (result.reduce((sum, r) => sum + r.pLearned, 0) /
                result.length) *
                100
            )
          : 0,
    };

    return response.sendSuccess(res, { skills: result, stats });
  } catch (error) {
    console.error("[BKT] getUserSkillMasteryByUserId error:", error);
    return response.sendError(
      res,
      error.message || "Failed to get skill mastery",
      500,
      error
    );
  }
};

/**
 * GET /api/bkt/mastery/history/:tagName
 * Trả lịch sử P(L) của 1 tag cho user hiện tại.
 */
export const getSkillHistory = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { tagName } = req.params;

    if (!userId) {
      return response.sendError(res, "Authentication required", 401);
    }

    const mastery = await UserSkillMastery.findOne({
      userId,
      tagName: String(tagName).trim(),
    }).lean();

    if (!mastery) {
      return response.sendSuccess(res, {
        tagName,
        pLearned: 0,
        history: [],
        message: "Chưa có dữ liệu cho skill này",
      });
    }

    return response.sendSuccess(res, {
      tagName: mastery.tagName,
      pLearned: mastery.pLearned,
      totalAttempts: mastery.totalAttempts,
      correctAttempts: mastery.correctAttempts,
      history: mastery.history || [],
    });
  } catch (error) {
    console.error("[BKT] getSkillHistory error:", error);
    return response.sendError(
      res,
      error.message || "Failed to get skill history",
      500,
      error
    );
  }
};

/**
 * GET /api/bkt/tags
 * Trả danh sách TagBKTProfile (admin only).
 */
export const getTagBKTProfiles = async (req, res) => {
  try {
    const profiles = await TagBKTProfile.find()
      .sort({ tagName: 1 })
      .lean();

    return response.sendSuccess(res, profiles);
  } catch (error) {
    console.error("[BKT] getTagBKTProfiles error:", error);
    return response.sendError(
      res,
      error.message || "Failed to get tag profiles",
      500,
      error
    );
  }
};

/**
 * PUT /api/bkt/tags/:tagName
 * Admin cập nhật tham số BKT cho 1 tag.
 */
export const updateTagBKTProfile = async (req, res) => {
  try {
    const { tagName } = req.params;
    const { pSlip, pGuess, pTransit, pInitial } = req.body;

    const updates = {};
    if (pSlip !== undefined) updates.pSlip = clampParam(pSlip);
    if (pGuess !== undefined) updates.pGuess = clampParam(pGuess);
    if (pTransit !== undefined) updates.pTransit = clampParam(pTransit);
    if (pInitial !== undefined) updates.pInitial = clampParam(pInitial);

    if (Object.keys(updates).length === 0) {
      return response.sendError(res, "No valid parameters provided", 400);
    }

    const profile = await TagBKTProfile.findOneAndUpdate(
      { tagName: String(tagName).trim() },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!profile) {
      return response.sendError(res, "Tag profile not found", 404);
    }

    return response.sendSuccess(res, profile);
  } catch (error) {
    console.error("[BKT] updateTagBKTProfile error:", error);
    return response.sendError(
      res,
      error.message || "Failed to update tag profile",
      500,
      error
    );
  }
};

/**
 * POST /api/bkt/tags/seed
 * Auto-seed TagBKTProfile từ tất cả tags trong problems.
 */
export const seedTagProfilesHandler = async (req, res) => {
  try {
    const result = await seedTagProfiles();
    return response.sendSuccess(res, result);
  } catch (error) {
    console.error("[BKT] seedTagProfiles error:", error);
    return response.sendError(
      res,
      error.message || "Failed to seed tag profiles",
      500,
      error
    );
  }
};

/** Clamp BKT parameter trong khoảng [0.01, 0.5] */
function clampParam(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0.1;
  return Math.max(0.01, Math.min(0.5, num));
}
