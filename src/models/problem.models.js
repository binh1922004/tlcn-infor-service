import mongoose from "mongoose";

const problemSchema = new mongoose.Schema({
    name: {type: String, unique: true},
    statement: {type: String, required: true, unique: true},
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
}, {
    timestamps: true //auto generate createAt and updateAt
})

export default mongoose.model('Problem', problemSchema);