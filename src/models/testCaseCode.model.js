import mongoose from "mongoose";

const testCaseCodeVersionSchema = new mongoose.Schema(
    {
        versionNumber: { type: Number, required: true },
        inputCode: { type: String, default: "" },
        outputCode: { type: String, default: "" },
        source: { type: String, default: null },
        model: { type: String, default: null },
        feedback: { type: String, default: null },
        s3Key: { type: String, default: null},
        generatedAt: { type: Date, default: Date.now },
        isSuccessful: { type: Boolean, default: false },
        errorMessage: { type: String, default: null },
        planVersionNumber: { type: Number, required: true },
    },
    { _id: false }
);

const testCaseCodeSchema = new mongoose.Schema(
    {
        planId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "TestCasePlan",
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        language: { type: String, default: "python" },
        status: {
            type: String,
            enum: ["pending", "done", "failed"],
            default: "pending",
        },
        versions: { type: [testCaseCodeVersionSchema], default: [] },
    },
    {
        timestamps: true,
    }
);

// A user should only have one code-generation document per plan
testCaseCodeSchema.index({ planId: 1, userId: 1 }, { unique: true });

export default mongoose.model("TestCaseCode", testCaseCodeSchema);
