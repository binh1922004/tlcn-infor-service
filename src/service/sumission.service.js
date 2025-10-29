import SubmissionModel from "../models/submission.model.js";
import {sendMessageToUser} from "../socket/socket.js";
import {Status} from "../utils/statusType.js";

export const updateSubmissionStatus = async (submissionId, data) => {
    try {
        const submission = await SubmissionModel.findById(submissionId);
        submission.status = data.overall;
        submission.time = data.time;
        submission.memory = data.memory;
        submission.passed = data.passed;
        submission.total = data.total;
        await submission.save();
        console.log(submission.user.toString());
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