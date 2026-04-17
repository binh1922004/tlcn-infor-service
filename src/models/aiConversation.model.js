import mongoose from "mongoose";

const aiMessageSchema = new mongoose.Schema(
    {
        role: {
            type: String,
            enum: ["user", "assistant", "system"],
            required: true,
        },
        content: { type: String, required: true },
        submission: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Submission",
            default: null,
        },
        source: { type: String, default: null },
        model: { type: String, default: null },
        errorType: { type: String, default: null },
        createdAt: { type: Date, default: Date.now },
    },
    {
        _id: false,
        strict: true,
    }
);

const aiConversationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        problem: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Problem",
            required: true,
            index: true,
        },
        messages: { type: [aiMessageSchema], default: [] },
        lastViewedAt: { type: Date, default: null },
        lastMessageAt: { type: Date, default: Date.now },
    },
    {
        timestamps: true,
        strict: true,
    }
);

aiConversationSchema.index({ user: 1, problem: 1 }, { unique: true });

export default mongoose.model("AiConversation", aiConversationSchema);
