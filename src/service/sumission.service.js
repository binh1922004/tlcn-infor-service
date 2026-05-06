import SubmissionModel from "../models/submission.model.js";
import userModel from "../models/user.models.js";
import { sendMessageToUser } from "../socket/socket.js";
import { Status } from "../utils/statusType.js";
import { updateContestParticipantProblemScore } from "./contest.service.js";
import { processSubmissionBKT } from "../utils/bkt.engine.js";
const updateClassroomProgress = async (userId, problemId, status) => {
    try {
        const problemModel = (await import('../models/problem.models.js')).default;
        const classroomModel = (await import('../models/classroom.model.js')).default;

        const problem = await problemModel.findById(problemId).select('shortId');
        if (!problem) {
            console.warn('⚠️ Problem not found for progress update:', problemId);
            return { updated: false };
        }

        // Find all classrooms that have this problem and this student
        const classrooms = await classroomModel.find({
            'problems.problemShortId': problem.shortId,
            'students.userId': userId
        });

        if (classrooms.length === 0) {
            return { updated: false };
        }

        // Determine progress status and score
        let progressStatus = 'attempted';
        let progressScore = 0;

        if (status === 'Accepted' || status === 'AC') {
            progressStatus = 'completed';
            progressScore = 100;
        }

        // Update progress in all relevant classrooms
        const updatedClassrooms = [];
        for (const classroom of classrooms) {
            await classroom.updateStudentProgress(
                userId,
                problem.shortId,
                progressStatus,
                progressScore
            );
            updatedClassrooms.push(classroom.classCode);
        }

        return {
            updated: true,
            classroomsCount: updatedClassrooms.length,
            classrooms: updatedClassrooms,
            problemShortId: problem.shortId,
            progressStatus,
            progressScore
        };
    } catch (error) {
        console.error('❌ Failed to update classroom progress:', error);
        return { updated: false, error: error.message };
    }
};

export const updateSubmissionStatus = async (submissionId, data) => {
    try {
        const submission = await SubmissionModel.findById(submissionId)
            .populate('contest')
            .populate('problem', 'numberOfTestCases time memory');
        submission.status = Status[data.status];
        submission.time = data.max_time;
        submission.memory = data.max_memory_mb;
        submission.passed = data.passed;
        submission.total = data.total;
        if (submission.type === 'contest' && submission.contest && submission.contestParticipant) {
            // If the submission is part of a contest, additional logic can be added here
            const contest = submission.contest;
            const problemInContest = contest.problems.find(p => p.problemId.toString() === submission.problem._id.toString());
            if (problemInContest) {
                const score = submission.passed / submission.problem.numberOfTestCases * problemInContest.point;
                submission.score = score;
                await updateContestParticipantProblemScore(
                    submission.contestParticipant,
                    submission.problem._id,
                    submissionId,
                    score,
                    submission.status === Status.AC
                );
            }
            else {
                return new Error("Problem not found in contest");
            }
        }
        await submission.save();

        if (submission.problem?._id) {
            const progressResult = await updateClassroomProgress(
                submission.user,
                submission.problem._id,
                submission.status
            );

        }

        // --- AI Recommendation Logic Start ---
        if (submission.status === Status.WA || submission.status === Status.TLE) {
            const aiHintThreshold = 3;
            const failedCount = await SubmissionModel.countDocuments({
                user: submission.user,
                problem: submission.problem._id,
                status: { $in: [Status.WA, Status.TLE] }
            });
            console.log(`[AI Trigger Check] User ${submission.user} failed ${failedCount} times on ${submission.problem._id}`);
            
            if (failedCount === aiHintThreshold) {
                const userPreference = await userModel.findById(submission.user).select('aiHintEnabled');
                if (userPreference?.aiHintEnabled === false) {
                    console.log(`[AI Hint Available] skipped because user disabled AI Hint: ${submission.user}`);
                } else {
                    const problemModel = (await import('../models/problem.models.js')).default;
                    const fullProblemInfo = await problemModel.findById(submission.problem._id).select('shortId name');
                    
                    if (fullProblemInfo) {
                        const hintAvailabilityPayload = {
                            problemId: submission.problem._id,
                            problemShortId: fullProblemInfo.shortId,
                            problemTitle: fullProblemInfo.name,
                            failedCount,
                            threshold: aiHintThreshold,
                            message: 'Bạn có thể sử dụng tính năng gợi ý của AI để hổ trợ làm bài.',
                            triggeredAt: new Date().toISOString(),
                        };

                        sendMessageToUser(submission.user.toString(), 'AI_HINT_AVAILABLE', hintAvailabilityPayload);
                        console.log(`[AI Hint Available] user=${submission.user} problem=${submission.problem._id}`);
                    }
                }
            }
        }
        // --- AI Recommendation Logic End ---

        // --- BKT Skill Mastery Update (async, non-blocking) ---
        if (submission.status !== Status.Pending && submission.status !== Status.Judging) {
            const isAccepted = submission.status === Status.AC;
            processSubmissionBKT(
                submission.user,
                submission.problem._id,
                isAccepted
            ).catch((err) => {
                console.error('[BKT] Non-blocking BKT update failed:', err.message);
            });
        }
        // --- BKT End ---

        sendMessageToUser(submission.user.toString(), 'submission-update', submission);
        return submission;
    }
    catch (error) {
        console.log(error);
        throw error;
    }
}


export const getLatestSubmissionByUser = async (userId, problemId) => {
    const filter = { user: userId };
    if (problemId) {
        filter.problem = problemId;
    }
    return await SubmissionModel.findOne(filter).sort({ createdAt: -1 });
}