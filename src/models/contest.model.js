import mongoose from "mongoose";
import {randomString} from "../helpers/random.js";

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
    code: { type: String, default: null, unique: true },
    isPrivate: { type: Boolean, default: false },
    password: { type: String, default: null },
    isActive: { type: Boolean, default: false },
    shortId: { type: String, default: () => randomString() }
}, {
    timestamps: true,//auto generate createAt and updateAt
    strict: true
})

export default mongoose.model('Contest', contestSchema);