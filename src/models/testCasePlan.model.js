import mongoose from "mongoose";

const testCaseCategoryGroupSchema = new mongoose.Schema(
    {
        category: {
            type: String,
            enum: ["normal", "edge", "boundary", "stress"],
            required: true,
        },
        count: { type: Number, required: true, min: 1 },
        description: { type: String, default: "" },
    },
    { _id: false }
);

const testCasePlanVersionSchema = new mongoose.Schema(
    {
        versionNumber: { type: Number, required: true },
        categories: { type: [testCaseCategoryGroupSchema], default: [] },
        source: { type: String, default: null },
        model: { type: String, default: null },
        generatedAt: { type: Date, default: Date.now },
    },
    { _id: false }
);


const testCasePlanSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        statement: { type: String, required: true },
        inputConstraint: { type: String, default: "" },
        outputConstraint: { type: String, default: "" },
        numberOfTestCases: { type: Number, default: 5, min: 1, max: 50 },
        versions: { type: [testCasePlanVersionSchema], default: [] },
        status: {
            type: String,
            enum: ["pending", "done", "failed"],
            default: "pending",
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("TestCasePlan", testCasePlanSchema);
