import userModel from '../models/user.models.js';
import response from '../helpers/response.js';

// Lấy thống kê tổng quan cho Admin Dashboard
export const getAdminStats = async (req, res, next) => {
  try {
    // Tổng số người dùng
    const totalUsers = await userModel.countDocuments();
    
    // Số giáo viên
    const totalTeachers = await userModel.countDocuments({ role: 'teacher' });
    
    // Số admin
    const totalAdmins = await userModel.countDocuments({ role: 'admin' });
    
    // Số người dùng đang hoạt động
    const totalActive = await userModel.countDocuments({ active: true });
    
    // Số người dùng bị khóa
    const totalInactive = await userModel.countDocuments({ active: false });
    
    // Thống kê theo vai trò
    const roleStats = await userModel.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Người dùng mới trong tháng này
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const newUsersThisMonth = await userModel.countDocuments({
      createdAt: { $gte: startOfMonth }
    });
    
    // Người dùng mới trong tuần này
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const newUsersThisWeek = await userModel.countDocuments({
      createdAt: { $gte: startOfWeek }
    });
    
    // Tính tỷ lệ tăng trưởng so với tháng trước
    const startOfLastMonth = new Date(startOfMonth);
    startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);
    
    const usersLastMonth = await userModel.countDocuments({
      createdAt: { $gte: startOfLastMonth, $lt: startOfMonth }
    });
    
    const growthRate = usersLastMonth > 0 
      ? (((newUsersThisMonth - usersLastMonth) / usersLastMonth) * 100).toFixed(2)
      : 0;
    
    return response.sendSuccess(res, {
      totalUsers,
      totalTeachers,
      totalAdmins,
      totalActive,
      totalInactive,
      newUsersThisMonth,
      newUsersThisWeek,
      growthRate: parseFloat(growthRate),
      roleDistribution: roleStats,
      activeRate: parseFloat(((totalActive / totalUsers) * 100).toFixed(2))
    }, 'Lấy thống kê tổng quan thành công');
  } catch (error) {
    console.error('Error getting admin stats:', error);
    return response.sendError(res, 'Không thể lấy thống kê tổng quan', 500, error.message);
  }
};

// Lấy thống kê chi tiết theo vai trò
export const getRoleStats = async (req, res, next) => {
  try {
    const stats = await userModel.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
          activeCount: {
            $sum: { $cond: ['$active', 1, 0] }
          },
          inactiveCount: {
            $sum: { $cond: ['$active', 0, 1] }
          }
        }
      },
      {
        $project: {
          role: '$_id',
          count: 1,
          activeCount: 1,
          inactiveCount: 1,
          activeRate: {
            $multiply: [
              { $divide: ['$activeCount', '$count'] },
              100
            ]
          }
        }
      }
    ]);
    
    return response.sendSuccess(res, stats, 'Lấy thống kê theo vai trò thành công');
  } catch (error) {
    console.error('Error getting role stats:', error);
    return response.sendError(res, 'Không thể lấy thống kê theo vai trò', 500, error.message);
  }
};

// Lấy danh sách người dùng mới nhất
export const getRecentUsers = async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;
    
    const recentUsers = await userModel
      .find()
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    return response.sendSuccess(res, recentUsers, 'Lấy danh sách người dùng mới thành công');
  } catch (error) {
    console.error('Error getting recent users:', error);
    return response.sendError(res, 'Không thể lấy danh sách người dùng mới', 500, error.message);
  }
};

// Lấy thống kê người dùng theo tháng (12 tháng gần nhất)
export const getUsersByMonthStats = async (req, res, next) => {
  try {
    const now = new Date();
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);
    
    const monthlyStats = await userModel.aggregate([
      {
        $match: {
          createdAt: { $gte: twelveMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 },
          activeCount: {
            $sum: { $cond: ['$active', 1, 0] }
          }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      },
      {
        $project: {
          _id: 0,
          year: '$_id.year',
          month: '$_id.month',
          count: 1,
          activeCount: 1,
          date: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: 1
            }
          }
        }
      }
    ]);
    
    // Tạo mảng đầy đủ 12 tháng (kể cả tháng không có data)
    const months = [];
    for (let i = 0; i < 12; i++) {
      const date = new Date(twelveMonthsAgo);
      date.setMonth(date.getMonth() + i);
      
      const existingStat = monthlyStats.find(stat => 
        stat.year === date.getFullYear() && stat.month === date.getMonth() + 1
      );
      
      months.push({
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        monthName: date.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' }),
        count: existingStat?.count || 0,
        activeCount: existingStat?.activeCount || 0
      });
    }
    
    return response.sendSuccess(res, months, 'Lấy thống kê theo tháng thành công');
  } catch (error) {
    console.error('Error getting users by month stats:', error);
    return response.sendError(res, 'Không thể lấy thống kê theo tháng', 500, error.message);
  }
};

// Lấy thống kê người dùng theo ngày (30 ngày gần nhất)
export const getUsersByDayStats = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    startDate.setHours(0, 0, 0, 0);
    
    const dailyStats = await userModel.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 },
          activeCount: {
            $sum: { $cond: ['$active', 1, 0] }
          }
        }
      },
      {
        $sort: { _id: 1 }
      },
      {
        $project: {
          _id: 0,
          date: '$_id',
          count: 1,
          activeCount: 1
        }
      }
    ]);
    
    // Tạo mảng đầy đủ các ngày (kể cả ngày không có data)
    const dates = [];
    for (let i = 0; i < parseInt(days); i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      
      const existingStat = dailyStats.find(stat => stat.date === dateStr);
      
      dates.push({
        date: dateStr,
        dateLabel: date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
        count: existingStat?.count || 0,
        activeCount: existingStat?.activeCount || 0
      });
    }
    
    return response.sendSuccess(res, {
      period: `${days} ngày`,
      data: dates
    }, 'Lấy thống kê theo ngày thành công');
  } catch (error) {
    console.error('Error getting users by day stats:', error);
    return response.sendError(res, 'Không thể lấy thống kê theo ngày', 500, error.message);
  }
};

// Lấy thống kê tổng quan theo khoảng thời gian tùy chỉnh
export const getCustomPeriodStats = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return response.sendError(res, 'Vui lòng cung cấp ngày bắt đầu và ngày kết thúc', 400);
    }
    
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    const stats = await userModel.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
          activeCount: {
            $sum: { $cond: ['$active', 1, 0] }
          }
        }
      }
    ]);
    
    const totalUsers = await userModel.countDocuments({
      createdAt: { $gte: start, $lte: end }
    });
    
    return response.sendSuccess(res, {
      period: {
        start: startDate,
        end: endDate
      },
      totalUsers,
      byRole: stats
    }, 'Lấy thống kê tùy chỉnh thành công');
  } catch (error) {
    console.error('Error getting custom period stats:', error);
    return response.sendError(res, 'Không thể lấy thống kê tùy chỉnh', 500, error.message);
  }
};