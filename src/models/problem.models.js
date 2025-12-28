import mongoose from "mongoose";
import { customAlphabet } from 'nanoid';
import {randomString} from "../helpers/random.js";

const problemSchema = new mongoose.Schema({
    name: {type: String},
    statement: {type: String, required: true},
    input: {type: String},
    output: {type: String, required: true},
    img: { type: [String], default: null },
    isPrivate: {type: Boolean, default: false},
    isPdf: {type: Boolean, default: false},
    examplesInput: {type: [String], default: false},
    examplesOutput: {type: [String], default: false},
    tags: [String],
    numberOfTestCases: {type: Number, default: 0},
    time: {type: Number, default: 1},
    memory: {type: Number, default: 512},
    isActive: {type: Boolean, default: false},
    numberOfSubmissions: {type: Number, default: 0},
    numberOfAccepted: {type: Number, default: 0},
    difficulty: {type: String, default: "Easy"},
    zipName: {type: String, default: null},
    shortId: { type: String, default: () => randomString() },
    classRoom: {type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', default: null, index: true},
    isContestInClassroom: {type: Boolean, default: false, index: true},
    createBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref:"User",
        default:null,
        index: true
    },
    version: {type: Number, default: 0},
}, {
    timestamps: true, //auto generate createAt and updateAtm
    strict: true
})
problemSchema.index({ classRoom: 1, isActive: 1 });
problemSchema.index({ classRoom: 1, isActive: 1, isContestInClassroom: 1 });
export default mongoose.model('Problem', problemSchema);