import mongoose from "mongoose";
import {randomString} from "../helpers/random.js";

const contestSchema = new mongoose.Schema({
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    description: { type: String },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    duration: { type: Number},
    problems: [{
        problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
        order: { type: Number, default: 0 },
        point: { type: Number, default: 0 },
    }],
    code: { type: String, default: null, unique: true },
    isPrivate: { type: Boolean, default: false },
    password: { type: String, default: null },
    isActive: { type: Boolean, default: false },
    classRoom: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', default: null},
    shortId: { type: String, default: () => randomString() }
}, {
    timestamps: true,//auto generate createAt and updateAt
    strict: true
})

contestSchema.post('save', async function(doc, next) {
    if (!doc.duration) {
        doc.duration = doc.endTime.getTime() - doc.startTime.getTime();
        await doc.save();
    }
})

export default mongoose.model('Contest', contestSchema);