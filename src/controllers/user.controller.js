import response from "../helpers/response.js";
import userModel from "../models/user.models.js";
export const getUsers = async (req, res, next) => {
  try {
    const users = await userModel.find();
    res.json(users);
  } catch (err) {
    next(err);
  }
};

export const getUserByUsername = async (req, res, next) => {
  try {
    const username = req.params.userName;
    const user = await userModel.findByUsername(username);
    if (!user) {
      return response.sendError(res, "User is not existed", 404);
    }

    return response.sendSuccess(res, {
      _id: user._id,
      userName: user.userName,
      fullName: user.fullName,
      isOwner: req.userName != null && user.userName === req.userName,
      dob: user.dob,
    });
  } catch (err) {
    next(err);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const username = req.userName;
    const userUpdate = req.body;
    const userFound = await userModel.findByUsername(username);
    if (username !== userFound.userName) {
      return response.sendError(res, "Bad request", 401);
    }
    for (let key in userUpdate) {
      userFound[key] = userUpdate[key];
    }
    await userFound.save();
    return response.sendSuccess(res, {
      _id: userFound._id,
      userName: userFound.userName,
      fullName: userFound.fullName,
      isOwner: req.userName != null && userFound.userName === req.userName,
      dob: userFound.dob,
    });
  } catch (err) {
    next(err);
  }
};
export const updateAvatar = async (req, res, next) => {
  try {
    const { avatar } = req.body;
    const userName = req.userName;
    if (!avatar || !avatar.startsWith("https://res.cloudinary.com/")) {
      return response.sendError(res, "Invalid avatar URL", 400);
    }
    const updatedUser = await User.findOneAndUpdate(
      { userName: userName }, // Tìm theo userName
      {
        avatar: avatar,
        updatedAt: new Date(),
      },
      { new: true, select: "-password" }
    );
    if (!updatedUser) {
      return response.sendError(res, "User not found", 404);
    }

    console.log("✅ Avatar updated for user:", userName);

    return response.sendSuccess(
      res,
      {
        user: updatedUser,
      },
      "Avatar updated successfully"
    );
  } catch (error) {
    console.error("❌ Update avatar error:", error);
    return response.sendError(res, "Internal server error", 500);
  }
};
