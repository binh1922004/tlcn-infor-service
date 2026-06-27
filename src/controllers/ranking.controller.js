import Contest from "../models/contest.model.js";
import ContestParticipant from "../models/contestParticipant.model.js";
import UserRating from "../models/userRating.model.js";
import RatingHistory from "../models/ratingHistory.model.js";
import ContestResult from "../models/contestResult.model.js";
import User from "../models/user.models.js";
import response from "../helpers/response.js";
import {
  calculateRatingForContest,
  ContestNotFoundError,
  ContestNotEndedError,
  AlreadyCalculatedError,
  NotEnoughParticipantsError,
} from "../service/rating.service.js";

// ─────────────────────────────────────────────────────────────
// Helper: map Elo → rank tier label
// ─────────────────────────────────────────────────────────────
const getRankTier = (elo) => {
  if (elo >= 2300) return "Diamond";
  if (elo >= 2000) return "Platinum";
  if (elo >= 1700) return "Gold";
  if (elo >= 1400) return "Silver";
  return "Bronze";
};

// ─────────────────────────────────────────────────────────────
// GET /api/rankings
// Lấy bảng xếp hạng toàn hệ thống
// Query: page, limit, search (username), rankFilter (tier)
// ─────────────────────────────────────────────────────────────
export const getLeaderboard = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const search = req.query.search?.trim() || "";
    const rankFilter = req.query.rankFilter?.trim() || "";

    // ── Build Elo filter từ rankFilter ──
    let eloFilter = {};
    switch (rankFilter) {
      case "Diamond":  eloFilter = { elo: { $gte: 2300 } }; break;
      case "Platinum": eloFilter = { elo: { $gte: 2000, $lt: 2300 } }; break;
      case "Gold":     eloFilter = { elo: { $gte: 1700, $lt: 2000 } }; break;
      case "Silver":   eloFilter = { elo: { $gte: 1400, $lt: 1700 } }; break;
      case "Bronze":   eloFilter = { elo: { $lt: 1400 } }; break;
      default: break;
    }

    // ── Nếu có search, tìm userId theo username trước ──
    let userIdFilter = {};
    if (search) {
      const matchedUsers = await User.find(
        { userName: { $regex: search, $options: "i" } },
        { _id: 1 }
      ).lean();

      if (matchedUsers.length === 0) {
        return response.sendSuccess(res, {
          rankings: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
        });
      }
      userIdFilter = { userId: { $in: matchedUsers.map((u) => u._id) } };
    }

    const filter = { ...eloFilter, ...userIdFilter };

    // ── Query UserRating + populate User info ──
    const [total, ratings] = await Promise.all([
      UserRating.countDocuments(filter),
      UserRating.find(filter)
        .sort({ elo: -1, updatedAt: 1 }) // tie-break: người cập nhật sớm hơn lên trước
        .skip(skip)
        .limit(limit)
        .populate({
          path: "userId",
          select: "userName fullName avatar",
          model: User,
        })
        .lean(),
    ]);

    // ── Tính rank tuyệt đối (global rank) ──
    const rankings = ratings.map((r, index) => {
      const user = r.userId;
      return {
        rank: skip + index + 1,
        userId: user?._id,
        userName: user?.userName,
        fullName: user?.fullName,
        avatar: user?.avatar || null,
        elo: r.elo,
        maxElo: r.maxElo,
        rankTier: getRankTier(r.elo),
        contestsJoined: r.contestsJoined,
        totalSolved: r.totalSolved,
      };
    });

    return response.sendSuccess(res, {
      rankings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("[getLeaderboard] Error:", err);
    return response.sendError(res, "Internal server error", 500);
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/rankings/users/:userId/rating
// Lấy thông tin Elo hiện tại của 1 user
// ─────────────────────────────────────────────────────────────
export const getUserRating = async (req, res) => {
  try {
    const { userId } = req.params;

    const rating = await UserRating.findOne({ userId })
      .populate({ path: "userId", select: "userName fullName avatar", model: User })
      .lean();

    if (!rating) {
      // User chưa có rating → trả về default
      const user = await User.findById(userId).select("userName fullName avatar").lean();
      if (!user) return response.sendError(res, "User not found", 404);

      return response.sendSuccess(res, {
        userId: user._id,
        userName: user.userName,
        fullName: user.fullName,
        avatar: user.avatar,
        elo: 1200,
        maxElo: 1200,
        rankTier: getRankTier(1200),
        contestsJoined: 0,
        totalSolved: 0,
      });
    }

    // Tính global rank bằng cách đếm user có Elo cao hơn
    const rankPosition = (await UserRating.countDocuments({ elo: { $gt: rating.elo } })) + 1;

    const user = rating.userId;
    return response.sendSuccess(res, {
      userId: user?._id,
      userName: user?.userName,
      fullName: user?.fullName,
      avatar: user?.avatar,
      elo: rating.elo,
      maxElo: rating.maxElo,
      rankTier: getRankTier(rating.elo),
      globalRank: rankPosition,
      contestsJoined: rating.contestsJoined,
      totalSolved: rating.totalSolved,
    });
  } catch (err) {
    console.error("[getUserRating] Error:", err);
    return response.sendError(res, "Internal server error", 500);
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/rankings/users/:userId/rating-history
// Lấy lịch sử thay đổi Elo của user, có pagination
// ─────────────────────────────────────────────────────────────
export const getUserRatingHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    const [total, history] = await Promise.all([
      RatingHistory.countDocuments({ userId }),
      RatingHistory.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({ path: "contestId", select: "title code shortId startTime endTime", model: Contest })
        .lean(),
    ]);

    const formattedHistory = history.map((h) => ({
      id: h._id,
      contest: h.contestId
        ? {
            id: h.contestId._id,
            title: h.contestId.title,
            code: h.contestId.code,
            shortId: h.contestId.shortId,
            startTime: h.contestId.startTime,
            endTime: h.contestId.endTime,
          }
        : null,
      oldElo: h.oldElo,
      newElo: h.newElo,
      eloChange: h.eloChange,
      rankBefore: h.rankBefore,
      createdAt: h.createdAt,
    }));

    return response.sendSuccess(res, {
      history: formattedHistory,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("[getUserRatingHistory] Error:", err);
    return response.sendError(res, "Internal server error", 500);
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/rankings/contests/:contestId/calculate-rating
// Delegate toàn bộ logic sang rating.service.js
// ─────────────────────────────────────────────────────────────
export const calculateContestRating = async (req, res) => {
  try {
    const { contestId } = req.params;
    const result = await calculateRatingForContest(contestId);

    return response.sendSuccess(
      res,
      {
        contestId: result.contestId,
        participantCount: result.participantCount,
        results: result.results,
      },
      `Rating calculated successfully for ${result.participantCount} participants.`,
      200
    );
  } catch (err) {
    if (err instanceof ContestNotFoundError) {
      return response.sendError(res, err.message, 404);
    }
    if (err instanceof ContestNotEndedError) {
      return response.sendError(res, "Contest has not ended yet. Cannot calculate rating before contest ends.", 400);
    }
    if (err instanceof AlreadyCalculatedError) {
      return response.sendError(res, "Rating for this contest has already been calculated.", 409);
    }
    if (err instanceof NotEnoughParticipantsError) {
      return response.sendError(res, err.message, 400);
    }
    console.error("[calculateContestRating] Error:", err);
    return response.sendError(res, "Internal server error", 500);
  }
};

