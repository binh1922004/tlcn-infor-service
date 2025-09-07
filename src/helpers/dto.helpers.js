
export const mapToUserDto = (user) => {
    return {
        id: user._id,
        userName: user.userName,
        email: user.email,
        fullName: user.fullName,
        active: user.active,
        avatar: user.avatar,
    }
}