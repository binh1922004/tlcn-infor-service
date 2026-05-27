import mongoose from "mongoose";

/**
 * TagBKTProfile – Tham số BKT tĩnh cho mỗi tag/skill.
 *
 * Mỗi tag (ví dụ "DP", "Graph", "Sorting") có bộ tham số riêng
 * dùng cho thuật toán Bayesian Knowledge Tracing.
 */
const tagBKTProfileSchema = new mongoose.Schema(
  {
    tagName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    /** P(S) – Xác suất "trượt": user đã biết nhưng vẫn trả lời sai */
    pSlip: { type: Number, default: 0.1, min: 0, max: 1 },

    /** P(G) – Xác suất "đoán": user chưa biết nhưng trả lời đúng */
    pGuess: { type: Number, default: 0.1, min: 0, max: 1 },

    /** P(T) – Xác suất chuyển trạng thái: từ chưa biết → đã biết sau 1 lần thực hành */
    pTransit: { type: Number, default: 0.1, min: 0, max: 1 },

    /** P(L₀) – Xác suất ban đầu user đã biết skill này */
    pInitial: { type: Number, default: 0.15, min: 0, max: 1 },
  },
  {
    timestamps: true,
    strict: true,
  }
);

export default mongoose.model("TagBKTProfile", tagBKTProfileSchema);
