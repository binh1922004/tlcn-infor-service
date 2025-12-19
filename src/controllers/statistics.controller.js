import User from '../models/user.models.js';
import Problem from '../models/problem.models.js';
import Submission from '../models/submission.model.js';
import Contest from '../models/contest.model.js';
import response from '../helpers/response.js';

/**
 * Get public statistics for landing page
 * @route GET /api/statistics/public
 * @access Public (no authentication required)
 */
export const getPublicStatistics = async (req, res) => {
  try {
    // 1. Count total users (exclude admins)
    const totalUsers = await User.countDocuments({ 
      role: { $in: ['user', 'teacher'] } 
    });

    // 2. Count total problems by difficulty
    const problemsByDifficulty = await Problem.aggregate([
      {
        $group: {
          _id: '$difficulty',
          count: { $sum: 1 }
        }
      }
    ]);

    // Format problem stats
    const problemStats = {
      total: 0,
      easy: 0,
      medium: 0,
      hard: 0
    };

    problemsByDifficulty.forEach(item => {
      const difficulty = item._id.toLowerCase();
      if (problemStats.hasOwnProperty(difficulty)) {
        problemStats[difficulty] = item.count;
        problemStats.total += item.count;
      }
    });

    // 3. Count total submissions
    const totalSubmissions = await Submission.countDocuments();

    // 4. Count total contests
    const totalContests = await Contest.countDocuments({ isActive: true });

    // Response with formatted data
    return response.sendSuccess(
      res,
      {
        users: totalUsers,
        problems: {
          total: problemStats.total,
          easy: problemStats.easy,
          medium: problemStats.medium,
          hard: problemStats.hard
        },
        submissions: totalSubmissions,
        contests: totalContests
      },
      'Public statistics retrieved successfully',
      200
    );

  } catch (error) {
    console.error('❌ Error getting public statistics:', error);
    return response.sendError(
      res,
      'Failed to retrieve public statistics',
      500,
      error.message
    );
  }
};

/**
 * Get dashboard statistics
 * @route GET /api/statistics/dashboard
 * @access Admin only
 */
export const getDashboardStatistics = async (req, res) => {
  try {
    // 1. Count total users (exclude admins)
    const totalUsers = await User.countDocuments({ 
      role: { $in: ['user', 'teacher'] } 
    });

    // 2. Count active users (users who have made at least one submission)
    const activeUsers = await Submission.distinct('user').then(users => users.length);

    // 3. Count problems by difficulty
    const problemsByDifficulty = await Problem.aggregate([
      {
        $group: {
          _id: '$difficulty',
          count: { $sum: 1 }
        }
      }
    ]);

    // Format problem stats
    const problemStats = {
      total: 0,
      easy: 0,
      medium: 0,
      hard: 0,
      active: 0,
      private: 0
    };

    problemsByDifficulty.forEach(item => {
      const difficulty = item._id.toLowerCase();
      problemStats[difficulty] = item.count;
      problemStats.total += item.count;
    });

    // Count active and private problems
    const [activeProblems, privateProblems] = await Promise.all([
      Problem.countDocuments({ isActive: true }),
      Problem.countDocuments({ isPrivate: true })
    ]);

    problemStats.active = activeProblems;
    problemStats.private = privateProblems;

    // 4. Count submissions
    const totalSubmissions = await Submission.countDocuments();
    const acceptedSubmissions = await Submission.countDocuments({ 
      status: 'AC' 
    });

    // Submission stats by status
    const submissionsByStatus = await Submission.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const submissionStats = {
      total: totalSubmissions,
      accepted: acceptedSubmissions,
      acceptanceRate: totalSubmissions > 0 
        ? ((acceptedSubmissions / totalSubmissions) * 100).toFixed(2) 
        : 0,
      byStatus: submissionsByStatus.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {})
    };

    const totalContests = await Contest.countDocuments();
    const activeContests = await Contest.countDocuments({
      isActive: true,
      startTime: { $lte: new Date() },
      endTime: { $gte: new Date() }
    });
    const upcomingContests = await Contest.countDocuments({
      startTime: { $gt: new Date() }
    });

    const contestStats = {
      total: totalContests,
      active: activeContests,
      upcoming: upcomingContests,
      private: await Contest.countDocuments({ isPrivate: true })
    };

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentActivity = {
      newUsers: await User.countDocuments({
        createdAt: { $gte: thirtyDaysAgo }
      }),
      newProblems: await Problem.countDocuments({
        createdAt: { $gte: thirtyDaysAgo }
      }),
      recentSubmissions: await Submission.countDocuments({
        createdAt: { $gte: thirtyDaysAgo }
      })
    };

    const topProblems = await Problem.find()
      .sort({ numberOfSubmissions: -1 })
      .limit(5)
      .select('name shortId numberOfSubmissions numberOfAccepted difficulty')
      .lean();

    // 8. Response
    return response.sendSuccess(
      res,
      {
        users: {
          total: totalUsers,
          active: activeUsers,
          inactiveRate: totalUsers > 0 
            ? (((totalUsers - activeUsers) / totalUsers) * 100).toFixed(2) 
            : 0
        },
        problems: problemStats,
        submissions: submissionStats,
        contests: contestStats,
        recentActivity,
        topProblems: topProblems.map(p => ({
          id: p.shortId,
          name: p.name,
          difficulty: p.difficulty,
          submissions: p.numberOfSubmissions,
          accepted: p.numberOfAccepted,
          acceptanceRate: p.numberOfSubmissions > 0
            ? ((p.numberOfAccepted / p.numberOfSubmissions) * 100).toFixed(2)
            : 0
        }))
      },
      'Statistics retrieved successfully',
      200
    );

  } catch (error) {
    console.error('❌ Error getting dashboard statistics:', error);
    return response.sendError(
      res,
      'Failed to retrieve statistics',
      500,
      error.message
    );
  }
};

/**
 * Get user growth statistics (by month)
 * @route GET /api/statistics/user-growth
 * @access Admin only
 */
export const getUserGrowthStatistics = async (req, res) => {
  try {
    const { months = 12 } = req.query;

    const userGrowth = await User.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': -1, '_id.month': -1 }
      },
      {
        $limit: parseInt(months)
      }
    ]);

    return response.sendSuccess(
      res,
      userGrowth.map(item => ({
        year: item._id.year,
        month: item._id.month,
        count: item.count,
        label: `${item._id.month}/${item._id.year}`
      })),
      'User growth statistics retrieved successfully',
      200
    );

  } catch (error) {
    console.error('❌ Error getting user growth statistics:', error);
    return response.sendError(
      res,
      'Failed to retrieve user growth statistics',
      500,
      error.message
    );
  }
};

/**
 * Get submission statistics by language
 * @route GET /api/statistics/submissions-by-language
 * @access Admin only
 */
export const getSubmissionsByLanguage = async (req, res) => {
  try {
    const languageStats = await Submission.aggregate([
      {
        $group: {
          _id: '$language',
          total: { $sum: 1 },
          accepted: {
            $sum: { $cond: [{ $eq: ['$status', 'AC'] }, 1, 0] }
          }
        }
      },
      {
        $sort: { total: -1 }
      }
    ]);

    return response.sendSuccess(
      res,
      languageStats.map(item => ({
        language: item._id,
        total: item.total,
        accepted: item.accepted,
        acceptanceRate: ((item.accepted / item.total) * 100).toFixed(2)
      })),
      'Submission statistics by language retrieved successfully',
      200
    );

  } catch (error) {
    console.error('❌ Error getting submission language statistics:', error);
    return response.sendError(
      res,
      'Failed to retrieve submission language statistics',
      500,
      error.message
    );
  }
};

/**
 * Get problem statistics by tags
 * @route GET /api/statistics/problems-by-tags
 * @access Admin only
 */
export const getProblemsByTags = async (req, res) => {
  try {
    const tagStats = await Problem.aggregate([
      { $unwind: '$tags' },
      {
        $group: {
          _id: '$tags',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    return response.sendSuccess(
      res,
      tagStats.map(item => ({
        tag: item._id,
        count: item.count
      })),
      'Problem statistics by tags retrieved successfully',
      200
    );

  } catch (error) {
    console.error('❌ Error getting problem tag statistics:', error);
    return response.sendError(
      res,
      'Failed to retrieve problem tag statistics',
      500,
      error.message
    );
  }
};