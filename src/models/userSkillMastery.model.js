import mongoose from "mongoose";

/**
 * UserSkillMastery – Trạng thái P(L) động cho mỗi cặp (user, tag).
 *
 * Được cập nhật mỗi khi user submit bài có tag tương ứng.
 * Lưu lịch sử P(L) để theo dõi tiến trình học.
 */
const historyEntrySchema = new mongoose.Schema(
  {
    pLearned: { type: Number, required: true },
    isCorrect: { type: Boolean, required: true },
    problemId: { type: mongoose.Schema.Types.ObjectId, ref: "Problem" },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSkillMasterySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    tagName: {
      type: String,
      required: true,
      trim: true,
    },

    /** P(L) hiện tại – xác suất user đã thành thạo skill */
    pLearned: { type: Number, default: 0.15, min: 0, max: 1 },

    /** Tổng số lần thử trên skill này */
    totalAttempts: { type: Number, default: 0 },

    /** Số lần trả lời đúng */
    correctAttempts: { type: Number, default: 0 },

    /** Thời điểm cập nhật gần nhất */
    lastUpdated: { type: Date, default: Date.now },

    /** Lịch sử P(L) gần nhất, capped tại 50 entries */
    history: {
      type: [historyEntrySchema],
      default: [],
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// Compound unique index: mỗi user chỉ có 1 record cho mỗi tag
userSkillMasterySchema.index({ userId: 1, tagName: 1 }, { unique: true });

// Cap history tại 50 entries trước mỗi lần save
userSkillMasterySchema.pre("save", function (next) {
  const MAX_HISTORY = 50;
  if (this.history && this.history.length > MAX_HISTORY) {
    // Giữ lại 50 entries mới nhất
    this.history = this.history.slice(-MAX_HISTORY);
  }
  next();
});

export default mongoose.model("UserSkillMastery", userSkillMasterySchema);
