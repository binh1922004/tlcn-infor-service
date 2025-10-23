import mongoose from "mongoose";
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);

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
    shortId: { type: String, default: () => nanoid() }
}, {
    timestamps: true //auto generate createAt and updateAt
})

export default mongoose.model('Problem', problemSchema);