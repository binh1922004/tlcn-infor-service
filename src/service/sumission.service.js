import SubmissionModel from "../models/submission.model.js";

export const updateSubmissionStatus = async (submissionId, data) => {
    try {
        const submission = await SubmissionModel.findById(submissionId);
        submission.status = data.overall;
        submission.time = data.time;
        submission.memory = data.memory;
        submission.passed = data.passed;
        submission.total = data.total;
        await submission.save();
        return submission;
    }
    catch (error) {
        console.log(error);
        throw error;
    }
}