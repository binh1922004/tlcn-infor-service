import mongoose from "mongoose";
import {randomString} from "../helpers/random.js";

const contestParticipantSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    contestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contest', required: true },
    joinedAt: { type: Date, default: Date.now },
    mode: { type: String, enum: ['virtual', 'official'], default: null},
    startTime: { type: Date, default: null },
    endTime: { type: Date, default: null },
    score: { type: Number, default: 0 }, // total score in the contest
    problemScores: [{
        problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
        bestScore: { type: Number, default: 0 }, // Highest score achieved for this problem
        bestSubmissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Submission' }, // Submission ID of the best submission
        attempts: { type: Number, default: 0 },
        lastSubmittedAt: { type: Date },
    }],
    lastBestSubmissionScoreAt: { type: Date },
    isDisqualified: { type: Boolean, default: false },
}, {
    timestamps: true,   //auto generate createAt and updateAt
    strict: true
})

contestParticipantSchema.pre('save', function(next) {
    if (this.problemScores) {
        let totalScore = 0;
        for (let ps of this.problemScores) {
            totalScore += ps.bestScore;
        }
        this.score = totalScore;
    }
    next();
});

export default mongoose.model('ContestParticipant', contestParticipantSchema);