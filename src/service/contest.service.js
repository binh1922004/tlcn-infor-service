import contestParticipantModel from "../models/contestParticipant.model.js";
import {mapToContestParticipantDto} from "../helpers/dto.helpers.js";

export const contestIsRunning = (contest) => {
    const now = new Date();
    return contest.isActive && now >= contest.startTime && now <= contest.endTime;
}

export const isRegisteredForContest = async (contestId, userId) => {
    const isRegistered = await contestParticipantModel.exists({contestId: contestId, userId: userId});
    return Boolean(isRegistered);
}

export const getUserParticipantStatus = async (contest, userId) => {
    let isRegistered = false;
    if (userId){
        isRegistered = await contestParticipantModel.exists({contestId: contest._id, userId: userId});
    }

    const latestParticipant = await contestParticipantModel.findOne({contestId: contest._id, userId: userId}).sort({joinedAt: -1});
    const now = new Date();
    const isStarted = latestParticipant && latestParticipant.startTime && now >= latestParticipant.startTime && now <= latestParticipant.endTime;

    return mapToContestParticipantDto({
        _id: latestParticipant?._id || null,
        isRegistered: Boolean(isRegistered),
        isStarted: isStarted,
        mode: latestParticipant?.mode,
        startTime: latestParticipant?.startTime,
        endTime: latestParticipant?.endTime,
    })
}

export const getLatestContestParticipant = async (contestId, userId) => {
    const latestParticipation = await contestParticipantModel.findOne({contestId: contestId, userId: userId}).sort({createdAt: -1});
    if (!latestParticipation){
        return null;
    }
    return latestParticipation;
}


export const updateContestParticipantProblemScore = async (contestParticipantId, problemId, submissionId, score) => {
    try {
        const contestParticipant = await contestParticipantModel.findById(contestParticipantId);
        if (!contestParticipant){
            throw new Error("Contest participant not found");
        }

        let problemScoreEntry = contestParticipant.problemScores.find(ps => ps.problemId.toString() === problemId.toString());
        if (!problemScoreEntry){
            problemScoreEntry = {
                problemId: problemId,
                bestScore: score,
                bestSubmissionId: submissionId,
                attempts: 1,
                lastSubmittedAt: new Date(),

            };
            contestParticipant.problemScores.push(problemScoreEntry);
            contestParticipant.lastBestSubmissionScoreAt = new Date();
        }
        else{
            problemScoreEntry.attempts += 1;
            problemScoreEntry.lastSubmittedAt = new Date();
            if (score > problemScoreEntry.bestScore){
                problemScoreEntry.bestScore = score;
                problemScoreEntry.bestSubmissionId = submissionId;
                contestParticipant.lastBestSubmissionScoreAt = new Date();
            }
        }
        await contestParticipant.save();
        return contestParticipant;
    }
    catch (error) {
        console.error(error);
        throw error;
    }
}

export const getRankingForContest = async (contestId, mode, pagination) => {
    const filter = { contestId: contestId };
    if (mode){
        filter.mode = mode;
    }

    const contestParticipants = await contestParticipantModel.find(filter)
        .populate('userId', 'userName fullName avatar')
        .sort({score: -1, lastBestSubmissionScoreAt: 1})
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean();
    return contestParticipants.map(m => mapToContestParticipantDto(m));
}