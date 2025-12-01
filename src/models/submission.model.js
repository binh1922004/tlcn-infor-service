import mongoose from "mongoose";
import {Status} from "../utils/statusType.js";
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);

const submissionSchema = new mongoose.Schema({
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
    type: {
        type: String,
        enum: ['regular', 'contest'],
        required: true,
        default: 'regular'
    },
    contestType: {
        type: String,
        enum: ['official', 'virtual'],
        required: function() {
            return this.type === 'contest';
        }
    },
    contestParticipant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ContestParticipant',
        required: function() {
            return this.contestType === 'virtual';
        }
    },
    score: {type: Number, default: 0}, // For future use in contests with score-based evaluation

    classroom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Classroom',
    default: null,
    index: true
  },
}, {
    timestamps: true, //auto generate createAt and updateAt
    strict: true
})
submissionSchema.pre('save', function (next) {
    this._isNew = this.isNew;
    this._wasAC = ! this.isNew && this.isModified('status') && this. status === Status.AC;
    next();
});

submissionSchema.post('save', async function (submission) {
    const Problem = mongoose.model('Problem');
    const updates = {};

    // Nếu là submission mới
    if (submission._isNew) {
        updates.numberOfSubmissions = 1;

        // Nếu submission mới này là AC luôn
        if (submission.status === Status.AC) {
            updates. numberOfAccepted = 1;
        }
    }
    // Nếu status thay đổi thành AC
    else if (submission._wasAC) {
        updates.numberOfAccepted = 1;
    }

    // Chỉ update nếu có thay đổi
    if (Object.keys(updates).length > 0) {
        await Problem.findByIdAndUpdate(
            submission.problem,
            { $inc: updates }
        );
    }
})
submissionSchema.index({ user: 1, classroom: 1 });

export default mongoose.model('Submission', submissionSchema);