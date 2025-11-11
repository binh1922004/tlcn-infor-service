import mongoose from "mongoose";
import {Status} from "../utils/statusType.js";
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);

const problemSchema = new mongoose.Schema({
    problem: {type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true},
    user: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    source: {type: String, required: true},
    status: {type: String, enum: Object.values(Status), default: Status.Pending},
    time: {type: Number, default: 0}, //time used in ms
    memory: {type: Number, default: 0}, //memory used in kb
    language: {type: String, required: true},
    isPrivate: {type: Boolean, default: false},
    passed: {type: Number, default: 0},
    total: {type: Number, default: 0},
    shortId: { type: String, default: () => nanoid() },
    contest: {type: mongoose.Schema.Types.ObjectId, ref: 'Contest', default: null},
}, {
    timestamps: true //auto generate createAt and updateAt
})

problemSchema.post('save', function (collection) {
    const problemId = collection.problem;
    mongoose.model('Problem').findByIdAndUpdate(problemId, { $inc: { numberOfSubmissions: 1 } }).exec();
    if (collection.status === Status.AC) {
        mongoose.model('Problem').findByIdAndUpdate(problemId, { $inc: { numberOfAccepted: 1 } }).exec();
    }
})

export default mongoose.model('Submission', problemSchema);