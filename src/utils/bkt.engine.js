import TagBKTProfile from "../models/tagBKTProfile.model.js";
import UserSkillMastery from "../models/userSkillMastery.model.js";
import problemModels from "../models/problem.models.js";

const BKT_DEFAULTS = Object.freeze({
  pSlip: 0.1,
  pGuess: 0.1,
  pTransit: 0.1,
  pInitial: 0.15,
});

// Mastery threshold – P(L) >= này → coi là đã thành thạo
export const MASTERY_THRESHOLD = 0.95;

// ─── Rating constants for item-level difficulty scaling ──
const RATING_MIN = 100;
const RATING_MAX = 1000;

/**
 * Clamp giá trị trong khoảng [min, max].
 */
function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Điều chỉnh P(G) và P(S) theo rating (độ khó) của bài.
 *
 * - D = normalized difficulty ∈ [0, 1]
 * - P(G)_item = P(G)_base × (1 − D)  → bài càng khó càng khó đoán đúng
 * - P(S)_item = P(S)_base + (0.5 − P(S)_base) × D → bài càng khó càng dễ trượt
 *
 * @param {Object} tagProfile - { pSlip, pGuess, pTransit, pInitial }
 * @param {number} problemRating - Rating của bài (100–1000, default 100)
 * @returns {{ pSlip: number, pGuess: number, pTransit: number, pInitial: number }}
 */
export function getProblemBKTParameters(tagProfile, problemRating = 100) {
  const profile = { ...BKT_DEFAULTS, ...tagProfile };
  const rating = clamp(problemRating, RATING_MIN, RATING_MAX);

  // Normalized difficulty ∈ [0, 1]
  const D = (rating - RATING_MIN) / (RATING_MAX - RATING_MIN);

  const pGuessItem = clamp(profile.pGuess * (1 - D), 0.01, 0.5);
  const pSlipItem = clamp(
    profile.pSlip + (0.5 - profile.pSlip) * D,
    0.01,
    0.5
  );

  return {
    pSlip: pSlipItem,
    pGuess: pGuessItem,
    pTransit: profile.pTransit,
    pInitial: profile.pInitial,
  };
}

/**
 * Cập nhật P(L) theo công thức BKT posterior + transition.
 *
 * @param {number} pLPrev - P(L) hiện tại trước khi observe
 * @param {boolean} isCorrect - User trả lời đúng hay sai
 * @param {{ pSlip: number, pGuess: number, pTransit: number }} params
 * @returns {number} P(L) mới
 */
export function updatePLearned(pLPrev, isCorrect, params) {
  const { pSlip, pGuess, pTransit } = params;
  const pL = clamp(pLPrev, 0.001, 0.999);

  let pLPosterior;

  if (isCorrect) {
    // P(L|correct) = P(L)·(1−P(S)) / [P(L)·(1−P(S)) + (1−P(L))·P(G)]
    const numerator = pL * (1 - pSlip);
    const denominator = numerator + (1 - pL) * pGuess;
    pLPosterior = denominator > 0 ? numerator / denominator : pL;
  } else {
    // P(L|wrong) = P(L)·P(S) / [P(L)·P(S) + (1−P(L))·(1−P(G))]
    const numerator = pL * pSlip;
    const denominator = numerator + (1 - pL) * (1 - pGuess);
    pLPosterior = denominator > 0 ? numerator / denominator : pL;
  }

  // Transition: P(L_new) = P(L|obs) + (1 − P(L|obs)) × P(T)
  const pLNew = pLPosterior + (1 - pLPosterior) * pTransit;

  return clamp(pLNew, 0, 1);
}

/**
 * Lấy hoặc tạo TagBKTProfile cho một tag.
 * Auto-seed nếu chưa tồn tại.
 */
async function getOrCreateTagProfile(tagName) {
  const normalized = String(tagName).trim();
  if (!normalized) return { ...BKT_DEFAULTS, tagName: "" };

  let profile = await TagBKTProfile.findOne({ tagName: normalized }).lean();
  if (!profile) {
    try {
      profile = await TagBKTProfile.create({ tagName: normalized });
      profile = profile.toObject();
    } catch (err) {
      // Race condition: another request created it first
      if (err.code === 11000) {
        profile = await TagBKTProfile.findOne({ tagName: normalized }).lean();
      }
      if (!profile) {
        return { ...BKT_DEFAULTS, tagName: normalized };
      }
    }
  }

  return profile;
}

/**
 * Lấy hoặc tạo UserSkillMastery cho (userId, tagName).
 */
async function getOrCreateMastery(userId, tagName, pInitial) {
  const normalized = String(tagName).trim();
  let mastery = await UserSkillMastery.findOne({
    userId,
    tagName: normalized,
  });

  if (!mastery) {
    try {
      mastery = await UserSkillMastery.create({
        userId,
        tagName: normalized,
        pLearned: pInitial,
        totalAttempts: 0,
        correctAttempts: 0,
        history: [],
      });
    } catch (err) {
      // Race condition
      if (err.code === 11000) {
        mastery = await UserSkillMastery.findOne({
          userId,
          tagName: normalized,
        });
      }
      if (!mastery) {
        throw new Error(
          `Failed to create UserSkillMastery for user=${userId} tag=${normalized}`
        );
      }
    }
  }

  return mastery;
}

/**
 * ═══════════════════════════════════════════════════════
 * Orchestration: Xử lý BKT sau mỗi submission.
 *
 * Được gọi từ submission.service.js sau khi judge xong.
 * ═══════════════════════════════════════════════════════
 *
 * @param {string|ObjectId} userId - ID của user
 * @param {string|ObjectId} problemId - ID của problem
 * @param {boolean} isCorrect - Submission có Accepted hay không
 * @returns {Promise<Array<{ tagName, pLearned, delta }>>}
 */
export async function processSubmissionBKT(userId, problemId, isCorrect) {
  try {
    // 1. Lấy problem info (tags + rating)
    const problem = await problemModels
      .findById(problemId)
      .select("tags rating")
      .lean();

    if (!problem || !Array.isArray(problem.tags) || problem.tags.length === 0) {
      return [];
    }

    const problemRating = problem.rating || 100;
    const results = [];

    // 2. Process từng tag
    for (const tag of problem.tags) {
      const normalizedTag = String(tag).trim();
      if (!normalizedTag) continue;

      try {
        // Lấy BKT parameters cho tag
        const tagProfile = await getOrCreateTagProfile(normalizedTag);

        // Điều chỉnh theo rating bài
        const itemParams = getProblemBKTParameters(tagProfile, problemRating);

        // Lấy/tạo mastery record
        const mastery = await getOrCreateMastery(
          userId,
          normalizedTag,
          tagProfile.pInitial || BKT_DEFAULTS.pInitial
        );

        const previousPL = mastery.pLearned;

        // Tính P(L) mới
        const newPL = updatePLearned(previousPL, isCorrect, itemParams);

        // Cập nhật mastery
        mastery.pLearned = newPL;
        mastery.totalAttempts += 1;
        if (isCorrect) mastery.correctAttempts += 1;
        mastery.lastUpdated = new Date();

        // Push vào history (pre-save hook sẽ cap tại 50)
        mastery.history.push({
          pLearned: newPL,
          isCorrect,
          problemId,
          timestamp: new Date(),
        });

        await mastery.save();

        results.push({
          tagName: normalizedTag,
          pLearned: newPL,
          delta: newPL - previousPL,
        });
      } catch (tagError) {
        console.error(
          `[BKT] Error processing tag "${normalizedTag}":`,
          tagError.message
        );
      }
    }

    return results;
  } catch (error) {
    console.error("[BKT] processSubmissionBKT error:", error);
    return [];
  }
}

/**
 * Seed TagBKTProfile cho tất cả tags hiện có trong hệ thống.
 * Chỉ tạo profile cho tag chưa có.
 */
export async function seedTagProfiles() {
  try {
    // Lấy tất cả unique tags từ problems
    const allTags = await problemModels.distinct("tags");
    const normalizedTags = [
      ...new Set(
        allTags
          .map((t) => String(t).trim())
          .filter(Boolean)
      ),
    ];

    let created = 0;
    let existing = 0;

    for (const tagName of normalizedTags) {
      const exists = await TagBKTProfile.findOne({ tagName }).lean();
      if (!exists) {
        try {
          await TagBKTProfile.create({ tagName });
          created++;
        } catch (err) {
          if (err.code === 11000) {
            existing++;
          }
        }
      } else {
        existing++;
      }
    }

    return {
      total: normalizedTags.length,
      created,
      existing,
      tags: normalizedTags,
    };
  } catch (error) {
    console.error("[BKT] seedTagProfiles error:", error);
    throw error;
  }
}
