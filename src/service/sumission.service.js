import SubmissionModel from "../models/submission.model.js";
import {sendMessageToUser} from "../socket/socket.js";
import {Status} from "../utils/statusType.js";
import contestModel from "../models/contest.model.js";
import {updateContestParticipantProblemScore} from "./contest.service.js";

export const updateSubmissionStatus = async (submissionId, data) => {
    try {
        const submission = await SubmissionModel.findById(submissionId)
            .populate('contest')
            .populate('problem', 'numberOfTestCases time memory');
        submission.status = data.overall;
        submission.time = data.time;
        submission.memory = data.memory;
        submission.passed = data.passed;
        submission.total = data.total;
        if (submission.type === 'contest' && submission.contest && submission.contestParticipant) {
            // If the submission is part of a contest, additional logic can be added here
            const contest = submission.contest;
            const problemInContest = contest.problems.find(p => p.problemId.toString() === submission.problem._id.toString());
            if (problemInContest){
                const score = submission.passed / submission.problem.numberOfTestCases * problemInContest.point;
                submission.score = score;
                await updateContestParticipantProblemScore(submission.contestParticipant, submission.problem._id, submissionId, score);
            }
            else{
                return new Error("Problem not found in contest");
            }
        }
        await submission.save();
        sendMessageToUser(submission.user.toString(), 'submission-update', submission);
        return submission;
    }
    catch (error) {
        console.log(error);
        throw error;
    }
}

export const getLatestSubmissionByUser = async (userId,  problemId) => {
    const filter = { user: userId };
    if (problemId) {
        filter.problem = problemId;
    }
    return await SubmissionModel.findOne(filter).sort({createdAt: -1});
}