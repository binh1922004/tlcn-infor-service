import mongoose from "mongoose";
import {randomString} from "../helpers/random.js";
import moment from "moment-timezone";

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
    shortId: { type: String, default: () => randomString() },
}, {
    timestamps: true,//auto generate createAt and updateAt
    strict: true,
    toJSON: {
        transform: function(doc, ret) {
            ret.createdAt = moment(ret.createdAt).tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD HH:mm:ss');
            ret.updatedAt = moment(ret.updatedAt).tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD HH:mm:ss');
            ret.startTime = moment(ret.startTime).tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD HH:mm:ss');
            ret.endTime = moment(ret.endTime).tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD HH:mm:ss');
            return ret;
        }
    }
})

contestSchema.post('save', async function(doc, next) {
    if (!doc.duration) {
        doc.duration = doc.endTime.getTime() - doc.startTime.getTime();
        await doc.save();
    }
})

export default mongoose.model('Contest', contestSchema);