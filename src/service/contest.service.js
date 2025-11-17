import contestParticipantModel from "../models/contestParticipant.model.js";

export const contestIsRunning = (contest) => {
    const now = new Date();
    return contest.isActive && now >= contest.startTime && now <= contest.endTime;
}

export const getUserParticipantStatus = async (contest, userId) => {
    let isRegistered = false;
    if (userId){
        isRegistered = await contestParticipantModel.exists({contestId: contest._id, userId: userId});
    }

    const latestParticipant = await contestParticipantModel.findOne({contestId: contest._id, userId: userId}).sort({joinedAt: -1});
    const now = new Date();
    const isStarted = latestParticipant && latestParticipant.startTime && now >= latestParticipant.startTime && now <= latestParticipant.endTime;

    return {
        isRegistered: Boolean(isRegistered),
        isStarted: isStarted,
        mode: latestParticipant?.mode,
        startTime: latestParticipant?.startTime,
        endTime: latestParticipant?.endTime,
    }
}