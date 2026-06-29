import mongoose from "mongoose";

/**
 * UserRating — Lưu điểm Elo và thống kê xếp hạng của mỗi user.
 * Mỗi user có duy nhất 1 document (userId là unique).
 * Elo mặc định = 1200 theo chuẩn hệ thống.
 */
const userRatingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    // Điểm Elo hiện tại
    elo: {
      type: Number,
      default: 1200,
      min: 0,
    },
    // Điểm Elo cao nhất từ trước đến nay
    maxElo: {
      type: Number,
      default: 1200,
      min: 0,
    },
    // Số contest đã tham gia và được tính Elo (mode = official)
    contestsJoined: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Tổng bài đã giải — cộng dồn từ solvedCount của các contest
    // (Phương án C: chỉ tính từ contest, không tính bài lẻ)
    totalSolved: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// Index để sort bảng xếp hạng nhanh theo Elo giảm dần
userRatingSchema.index({ elo: -1 });

export default mongoose.model("UserRating", userRatingSchema);
