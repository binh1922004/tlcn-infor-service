import moment from "moment-timezone";

export const mapToUserDto = (user) => {
    return {
        id: user._id,
        userName: user.userName,
        email: user.email,
        fullName: user.fullName,
        active: user.active,
        avatar: user.avatar,
        role: user.role
    }
}
export const pageDTO = (data, total, page, limit) => {
    return {
        content: data,
        page : Number(page),
        total: Number(total),
        totalPages: Math.ceil(total / limit),
        last: page>=total/limit-1
    }
}

export const mapToContestDto = (contest) => {
    return {
        _id: contest._id,
        title: contest.title,
        description: contest.description,
        startTime: convertToUTC7(contest.startTime),
        endTime: convertToUTC7(contest.endTime),
        isPrivate: contest.isPrivate,
        isActive: contest.isActive,
        problems: contest.problems,
        createdAt: contest.createdAt,
        updatedAt: contest.updatedAt,
        shortId: contest.shortId,
        code: contest.code,
        isRegistered: contest.isRegistered,
        noOfSolved: contest.noOfSolved,
        classRoom: contest.classRoom ? {
            _id: contest.classRoom._id,
            className: contest.classRoom.className,
            classCode: contest.classRoom.classCode
        } : null,
        noOfParticipants: contest.noOfParticipants,
        duration: contest.duration,
    }
}


export const mapToContestParticipantDto = (participant) => {
    return {
        id: participant._id,
        user: participant.userId || participant.user,
        contestId: participant.contestId,
        joinedAt: convertToUTC7(participant.joinedAt),
        mode: participant.mode,
        startTime: convertToUTC7(participant.startTime),
        endTime: convertToUTC7(participant.endTime),
        score: participant.score,
        isRegistered: participant.isRegistered,
        isStarted: participant.isStarted,
        isDisqualified: participant.isDisqualified,
        problemScores: participant.problemScores,
        lastBestSubmissionScoreAt: convertToUTC7(participant.lastBestSubmissionScoreAt),
    }
}

const convertToUTC7 = (date) => {
    return moment(date).tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD HH:mm:ss');
};