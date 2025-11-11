import mongoose from "mongoose";

const contestSchema = new mongoose.Schema({
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    description: { type: String },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    problems: [{
        problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
        order: { type: Number, default: 0 }
    }],
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, {
    timestamps: true //auto generate createAt and updateAt
})

export default mongoose.model('User', contestSchema);