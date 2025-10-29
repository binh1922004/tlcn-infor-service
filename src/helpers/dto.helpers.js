
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