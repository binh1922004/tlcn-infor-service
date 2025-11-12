
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
        startTime: contest.startTime,
        endTime: contest.endTime,
        isPrivate: contest.isPrivate,
        isActive: contest.isActive,
        problems: contest.problems,
        createdAt: contest.createdAt,
        updatedAt: contest.updatedAt,
        shortId: contest.shortId,
    }
}