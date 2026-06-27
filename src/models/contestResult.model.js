import mongoose from "mongoose";

/**
 * ContestResult — Kết quả xếp hạng + Elo của từng user trong một contest.
 * Được tạo khi Admin/Teacher gọi API calculate-rating.
 *
 * Unique index (contestId + userId) đảm bảo không tính Elo 2 lần
 * cho cùng 1 user trong cùng 1 contest.
 */
const contestResultSchema = new mongoose.Schema(
  {
    contestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contest",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Thứ hạng trong contest (1 = nhất)
    rankPosition: {
      type: Number,
      required: true,
      min: 1,
    },
    // Số bài đã giải trong contest
    solvedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Tổng penalty (ms) — dùng để break tie
    penalty: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Snapshot Elo tại thời điểm tính
    oldElo: {
      type: Number,
      required: true,
    },
    newElo: {
      type: Number,
      required: true,
    },
    eloChange: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// Unique compound index — chặn tính Elo lặp lại cho cùng (contest, user)
contestResultSchema.index({ contestId: 1, userId: 1 }, { unique: true });

export default mongoose.model("ContestResult", contestResultSchema);
