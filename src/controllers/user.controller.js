import response from "../helpers/response.js";
import userModel from "../models/user.models.js";
import { fuzzySearchPaginated } from "../utils/fuzzySearch.js";
export const checkUsername = async (req, res, next) => {
  const userName = req.query.username;
  const user = await userModel.findOne({ userName: userName });
  if (user){
    return response.sendError(res, 'Existed username', 409)
  }
  return response.sendSuccess(res, true);
}

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
    const username = req.params.username;
    console.log(username);
    const user = await userModel.findByUsername(username);
    if (!user) {
      return response.sendError(res, "User is not existed", 404);
    }

    return response.sendSuccess(res, {
      _id: user._id,
      userName: user.userName,
      fullName: user.fullName,
      email: user.email,
      avatar: user.avatar,
      active: user.active,
      role: user.role,
      isOwner: req.user?.userName != null && user.userName === req.user?.userName,
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
    console.log(avatar);
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

    console.log("Avatar updated for user:", userName);

    return response.sendSuccess(
      res,
      {
        user: updatedUser,
      },
      "Avatar updated successfully"
    );
  } catch (error) {
    console.error("Update avatar error:", error);
    return response.sendError(res, "Internal server error", 500);
  }
};

// Lấy dữ liệu biểu đồ theo timeline
export const getUserRegistrationTimeline = async (req, res, next) => {
  try {
    const { period } = req.query; // 'week', 'month', 'quarter', 'year'
    const now = new Date();
    let startDate, groupBy, points;
    
    switch (period) {
      case 'week':
        // 7 ngày gần nhất
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 6);
        groupBy = { 
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
        };
        points = 7;
        break;
        
      case 'month':
        // 30 ngày gần nhất
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 29);
        groupBy = { 
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
        };
        points = 30;
        break;
        
      case 'quarter':
        // 10 tuần gần nhất (70 ngày)
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 69);
        groupBy = {
          $dateToString: { 
            format: "%Y-W%V", // Year-Week format
            date: "$createdAt" 
          }
        };
        points = 10;
        break;
        
      case 'year':
        // 12 tháng gần nhất
        startDate = new Date(now);
        startDate.setMonth(startDate.getMonth() - 11);
        groupBy = {
          $dateToString: { format: "%Y-%m", date: "$createdAt" }
        };
        points = 12;
        break;
        
      default:
        return response.sendError(res, 'Invalid period parameter', 400);
    }
    
    // Aggregate data
    const registrationData = await userModel.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: groupBy,
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    // Format data để trả về
    const formattedData = registrationData.map(item => ({
      date: item._id,
      count: item.count
    }));
    
    return response.sendSuccess(res, {
      period,
      points,
      data: formattedData
    });
  } catch (error) {
    console.error('Error getting user registration timeline:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};
// Lấy danh sách người dùng với phân trang và tìm kiếm
export const getUsersList = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      role = '',  
      sortBy = 'createdAt', 
      order = 'desc'
    } = req.query;
    
    // Additional query cho role filter
    const additionalQuery = {};
    if (role && role !== 'all') {
      if (role === 'user') {
        additionalQuery.$or = [
          { role: 'user' },
          { role: { $exists: false } },
          { role: null }
        ];
      } else {
        additionalQuery.role = role;
      }
    }
    
    // Fuzzy search với phân trang - fuzzyLevel cố định là NORMAL
    const result = await fuzzySearchPaginated(
      userModel,
      search,
      ['userName', 'fullName', 'email'],
      {
        page: parseInt(page),
        limit: parseInt(limit),
        additionalQuery,
        select: '-password',
        sort: { [sortBy]: order === 'desc' ? -1 : 1 },
        fuzzyLevel: 'NORMAL' // Set cứng fuzzyLevel là NORMAL
      }
    );
    
    return response.sendSuccess(res, {
      users: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Error getting users list:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

// Xóa người dùng (soft delete hoặc hard delete)
export const deleteUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    
    const user = await userModel.findById(userId);
    if (!user) {
      return response.sendError(res, 'User not found', 404);
    }
    
    // Hard delete
    await userModel.findByIdAndDelete(userId);
    
    return response.sendSuccess(res, null, 'User deleted successfully');
  } catch (error) {
    console.error('Error deleting user:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

// Cập nhật trạng thái người dùng (active/inactive)
export const updateUserStatus = async (req, res, next) => {
  try {
    const { userName } = req.params;
    const { active } = req.body;
    
    const user = await userModel.findOneAndUpdate(
      { userName: userName },
      { active, updatedAt:   new Date() },
      { new: true, select: '-password' }
    );
    
    if (!user) {
      return response.sendError(res, 'User not found', 404);
    }
    
    return response.sendSuccess(res, user, 'User status updated successfully');
  } catch (error) {
    console.error('Error updating user status:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};