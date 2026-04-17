import SubmissionModel from "../models/submission.model.js";
import { sendMessageToUser } from "../socket/socket.js";
import { Status } from "../utils/statusType.js";
import { updateContestParticipantProblemScore } from "./contest.service.js";
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
            console.log('ℹ️ No classrooms found for progress update');
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

            console.log(`✅ Updated progress in classroom ${classroom.classCode}:`, {
                userId,
                problemShortId: problem.shortId,
                status: progressStatus,
                score: progressScore
            });
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

            console.log('📊 Classroom progress update result:', progressResult);
        }

        // --- AI Recommendation Logic Start ---
        if (submission.status === Status.WA || submission.status === Status.TLE) {
            const failedCount = await SubmissionModel.countDocuments({
                user: submission.user,
                problem: submission.problem._id,
                status: { $in: [Status.WA, Status.TLE] }
            });
            console.log(`[AI Trigger Check] User ${submission.user} failed ${failedCount} times on ${submission.problem._id}`);
            
            if (failedCount === 3) {
                const problemModel = (await import('../models/problem.models.js')).default;
                const fullProblemInfo = await problemModel.findById(submission.problem._id);
                
                if (fullProblemInfo) {
                    const aiRequestPayload = {
                        userId: submission.user,
                        submissionId: submission._id,
                        problemId: submission.problem._id,
                        problemShortId: fullProblemInfo.shortId,
                        problemTitle: fullProblemInfo.name,
                        problemStatement: fullProblemInfo.statement || '',
                        problemInput: fullProblemInfo.input || '',
                        problemOutput: fullProblemInfo.output || '',
                        examplesInput: fullProblemInfo.examplesInput || [],
                        examplesOutput: fullProblemInfo.examplesOutput || [],
                        sourceCode: submission.source,
                        language: submission.language,
                        failedReason: submission.status
                    };
                    
                    const { sendMessage } = await import('./kafka.service.js');
                    await sendMessage('ai_request', aiRequestPayload);
                    console.log(`[AI Request Sent] for submission ${submission._id}`);
                }
            }
        }
        // --- AI Recommendation Logic End ---

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