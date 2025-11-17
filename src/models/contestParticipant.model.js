import mongoose from "mongoose";
import {randomString} from "../helpers/random.js";

const contestParticipantSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    contestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contest', required: true },
    joinedAt: { type: Date, default: Date.now },
    mode: { type: String, enum: ['virtual', 'official'], default: null},
    startTime: { type: Date, default: null },
    endTime: { type: Date, default: null },
    score: { type: Number, default: 0 },
}, {
    timestamps: true,//auto generate createAt and updateAt
    strict: true
})

export default mongoose.model('ContestParticipant', contestParticipantSchema);