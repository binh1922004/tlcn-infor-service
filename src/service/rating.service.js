/**
 * rating.service.js
 *
 * Core business logic để tính Elo sau khi một contest kết thúc.
 * Được dùng bởi:
 *   - ranking.controller.js  (HTTP API endpoint)
 *   - rating.job.js          (cron job tự động)
 *
 * Flow:
 *   1. Validate contest (tồn tại, đã kết thúc)
 *   2. Atomic lock: dùng findOneAndUpdate để set ratingCalculated = true
 *      → Đảm bảo chỉ 1 instance/process tính Elo, kể cả khi chạy nhiều server
 *   3. Lấy danh sách participant hợp lệ, xếp hạng, tính Elo
 *   4. Bulk write kết quả vào UserRating, ContestResult, RatingHistory
 *   5. Nếu lỗi giữa chừng → rollback ratingCalculated = false
 */

import Contest from '../models/contest.model.js';
import ContestParticipant from '../models/contestParticipant.model.js';
import UserRating from '../models/userRating.model.js';
import RatingHistory from '../models/ratingHistory.model.js';
import ContestResult from '../models/contestResult.model.js';
import { calculateEloChanges } from './elo.service.js';
import { log, logError } from '../utils/logger.js';

// ─────────────────────────────────────────────────────────────
// Error types cho caller phân biệt
// ─────────────────────────────────────────────────────────────
export class ContestNotFoundError extends Error {
  constructor(contestId) {
    super(`Contest not found: ${contestId}`);
    this.name = 'ContestNotFoundError';
  }
}

export class ContestNotEndedError extends Error {
  constructor(endTime) {
    super(`Contest has not ended yet (endTime: ${endTime})`);
    this.name = 'ContestNotEndedError';
  }
}

export class AlreadyCalculatedError extends Error {
  constructor(contestId) {
    super(`Rating already calculated for contest: ${contestId}`);
    this.name = 'AlreadyCalculatedError';
  }
}

export class NotEnoughParticipantsError extends Error {
  constructor(count) {
    super(`Not enough participants (found ${count}, minimum 2)`);
    this.name = 'NotEnoughParticipantsError';
  }
}

// ─────────────────────────────────────────────────────────────
// Core service function
// ─────────────────────────────────────────────────────────────

/**
 * Tính Elo cho tất cả participant sau khi contest kết thúc.
 *
 * @param {string} contestId - MongoDB ObjectId của contest
 * @returns {Object} { contestId, participantCount, results }
 * @throws {ContestNotFoundError | ContestNotEndedError | AlreadyCalculatedError | NotEnoughParticipantsError}
 */
export const calculateRatingForContest = async (contestId) => {
  // ── 1. Load contest ──
  const contest = await Contest.findById(contestId).lean();
  if (!contest) throw new ContestNotFoundError(contestId);

  // ── 2. Kiểm tra đã kết thúc chưa ──
  const now = new Date();
  if (new Date(contest.endTime) > now) {
    throw new ContestNotEndedError(contest.endTime);
  }

  // ── 3. Atomic lock: chỉ process đầu tiên được tính ──
  // findOneAndUpdate với điều kiện ratingCalculated = false
  // Nếu đã = true → null → throw AlreadyCalculatedError
  // Đây là cơ chế an toàn khi nhiều server instance chạy cùng lúc
  const locked = await Contest.findOneAndUpdate(
    { _id: contestId, ratingCalculated: false },
    { $set: { ratingCalculated: true } },
    { new: false } // trả về doc trước khi update để confirm đã lock được
  );

  if (!locked) {
    // Có thể đã tính hoặc đang tính bởi instance khác
    throw new AlreadyCalculatedError(contestId);
  }

  try {
    // ── 4. Lấy participants hợp lệ ──
    const participants = await ContestParticipant.find({
      contestId,
      mode: 'official',
      isDisqualified: false,
    })
      .select('userId score lastBestSubmissionScoreAt problemScores')
      .lean();

    if (participants.length < 2) {
      // Rollback lock nếu không đủ người
      await Contest.findByIdAndUpdate(contestId, { $set: { ratingCalculated: false } });
      throw new NotEnoughParticipantsError(participants.length);
    }

    // ── 5. Xếp hạng: score giảm dần, penalty tăng dần ──
    const sorted = [...participants].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const tA = a.lastBestSubmissionScoreAt
        ? new Date(a.lastBestSubmissionScoreAt).getTime()
        : Infinity;
      const tB = b.lastBestSubmissionScoreAt
        ? new Date(b.lastBestSubmissionScoreAt).getTime()
        : Infinity;
      return tA - tB;
    });

    // Gán rankPosition (đồng điểm đồng thời → cùng rank)
    const rankedParticipants = [];
    let currentRank = 1;
    for (let i = 0; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const sameAsPrev =
        i > 0 &&
        curr.score === prev.score &&
        (curr.lastBestSubmissionScoreAt?.getTime?.() ?? null) ===
          (prev.lastBestSubmissionScoreAt?.getTime?.() ?? null);

      rankedParticipants.push({
        ...curr,
        rankPosition: sameAsPrev
          ? rankedParticipants[i - 1].rankPosition
          : currentRank,
      });
      if (!sameAsPrev) currentRank = i + 2;
    }

    // ── 6. Lấy UserRating hiện tại ──
    const userIds = rankedParticipants.map((p) => p.userId);

    const [existingRatings, globalRankDocs] = await Promise.all([
      UserRating.find({ userId: { $in: userIds } }).lean(),
      UserRating.aggregate([
        { $match: { userId: { $in: userIds } } },
        {
          $lookup: {
            from: 'userratings',
            let: { myElo: '$elo' },
            pipeline: [{ $match: { $expr: { $gt: ['$elo', '$$myElo'] } } }],
            as: 'higher',
          },
        },
        { $project: { userId: 1, rankBefore: { $add: [{ $size: '$higher' }, 1] } } },
      ]),
    ]);

    const ratingMap = new Map(existingRatings.map((r) => [r.userId.toString(), r]));
    const globalRankMap = new Map(globalRankDocs.map((d) => [d.userId.toString(), d.rankBefore]));

    // ── 7. Tính Elo ──
    const eloInput = rankedParticipants.map((p) => {
      const uid = p.userId.toString();
      return {
        userId: p.userId,
        elo: ratingMap.get(uid)?.elo ?? 1200,
        rankPosition: p.rankPosition,
      };
    });

    const eloResults = calculateEloChanges(eloInput);
    const eloResultMap = new Map(eloResults.map((r) => [r.userId.toString(), r]));

    // ── 8. Chuẩn bị bulk write ──
    const userRatingBulkOps = [];
    const contestResultDocs = [];
    const ratingHistoryDocs = [];

    for (const p of rankedParticipants) {
      const uid = p.userId.toString();
      const result = eloResultMap.get(uid);
      const solvedCount = p.problemScores?.filter((ps) => ps.bestScore > 0).length ?? 0;
      const rankBefore = globalRankMap.get(uid) ?? null;
      const currentMaxElo = ratingMap.get(uid)?.maxElo ?? 1200;

      userRatingBulkOps.push({
        updateOne: {
          filter: { userId: p.userId },
          update: {
            $set: {
              elo: result.newElo,
              maxElo: Math.max(currentMaxElo, result.newElo),
            },
            $inc: {
              contestsJoined: 1,
              totalSolved: solvedCount,
            },
          },
          upsert: true,
        },
      });

      contestResultDocs.push({
        contestId,
        userId: p.userId,
        rankPosition: p.rankPosition,
        solvedCount,
        penalty: p.lastBestSubmissionScoreAt
          ? new Date(p.lastBestSubmissionScoreAt).getTime()
          : 0,
        oldElo: result.oldElo,
        newElo: result.newElo,
        eloChange: result.eloChange,
      });

      ratingHistoryDocs.push({
        userId: p.userId,
        contestId,
        oldElo: result.oldElo,
        newElo: result.newElo,
        eloChange: result.eloChange,
        rankBefore,
        rankAfter: null,
      });
    }

    // ── 9. Persist ──
    await Promise.all([
      UserRating.bulkWrite(userRatingBulkOps),
      ContestResult.insertMany(contestResultDocs),
      RatingHistory.insertMany(ratingHistoryDocs),
    ]);

    log(`[RatingService] ✅ Calculated Elo for contest "${contest.title}" — ${rankedParticipants.length} participants`);

    return {
      contestId,
      contestTitle: contest.title,
      participantCount: rankedParticipants.length,
      results: eloResults.map((r) => ({
        userId: r.userId,
        oldElo: r.oldElo,
        newElo: r.newElo,
        eloChange: r.eloChange,
        rankPosition: rankedParticipants.find(
          (p) => p.userId.toString() === r.userId.toString()
        )?.rankPosition,
      })),
    };
  } catch (err) {
    // Nếu lỗi sau khi đã lock → rollback để cron có thể thử lại
    if (
      !(err instanceof AlreadyCalculatedError) &&
      !(err instanceof NotEnoughParticipantsError)
    ) {
      logError(`[RatingService] Rolling back lock for contest ${contestId}:`, err);
      await Contest.findByIdAndUpdate(contestId, { $set: { ratingCalculated: false } });
    }
    throw err;
  }
};
