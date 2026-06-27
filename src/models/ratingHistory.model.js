import mongoose from "mongoose";

/**
 * RatingHistory — Lịch sử thay đổi Elo của user sau mỗi contest.
 * Mỗi entry tương ứng 1 lần tính Elo cho 1 user trong 1 contest.
 * Dùng để vẽ biểu đồ rating progression về sau.
 */
const ratingHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    contestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contest",
      required: true,
      index: true,
    },
    // Điểm Elo trước khi tham gia contest này
    oldElo: {
      type: Number,
      required: true,
    },
    // Điểm Elo sau khi tính xong
    newElo: {
      type: Number,
      required: true,
    },
    // Thay đổi Elo: newElo - oldElo (có thể âm)
    eloChange: {
      type: Number,
      required: true,
    },
    // Thứ hạng toàn cầu TRƯỚC khi tính Elo contest này
    rankBefore: {
      type: Number,
      default: null,
    },
    // Để null — tính động khi cần (tránh query tốn kém)
    rankAfter: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// Index để query lịch sử của 1 user nhanh, sort theo thời gian
ratingHistorySchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("RatingHistory", ratingHistorySchema);
