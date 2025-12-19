import response from "../../helpers/response.js";
import problemModel from "../../models/problem.models.js";
import submissionModel from "../../models/submission.model.js";
import userModel from "../../models/user.models.js";

/**
 * Get student stats for a classroom
 * Route: GET /api/classroom/class/:classCode/stats
 */
export const getStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const classroom = req.classroom;
    
    const totalProblems = classroom.problems.length;

    const problemShortIds = classroom.problems.map(p => p.problemShortId);
    const problems = await problemModel.find({ shortId: { $in: problemShortIds } });
    
    const problemIds = problems.map(p => p._id);
    
    const classroomSubmissions = await submissionModel
      .find({
        user: userId,
        classroom: classroom._id,
        problem: { $in: problemIds }
      })
      .sort({ submittedAt: -1 });

    const studentProgress = classroom.problems.map(cp => {
      const problem = problems.find(p => p.shortId === cp.problemShortId);
      
      if (!problem) {
        return {
          userId,
          problemShortId: cp.problemShortId,
          status: 'not_attempted',
          bestScore: 0,
          lastSubmissionAt: null,
          completedAt: null
        };
      }

      const problemSubmissions = classroomSubmissions.filter(
        s => s.problem.toString() === problem._id.toString()
      );

      const acceptedSubmissions = problemSubmissions.filter(
        s => s.status === 'Accepted' || s.status === 'AC'
      );

      const bestSubmission = acceptedSubmissions.sort((a, b) => {
        return (b.score || 0) - (a.score || 0);
      })[0];

      let status = 'not_attempted';
      if (acceptedSubmissions.length > 0) {
        status = 'completed';
      } else if (problemSubmissions.length > 0) {
        status = 'attempted';
      }

      return {
        userId,
        problemShortId: cp.problemShortId,
        status,
        bestScore: bestSubmission?.score || 0,
        lastSubmissionAt: problemSubmissions[0]?.submittedAt || null,
        completedAt: bestSubmission?.submittedAt || null
      };
    });

    const completedProblems = studentProgress.filter(
      p => p.status === 'completed'
    ).length;

    const attemptedProblems = studentProgress.filter(
      p => p.status === 'attempted'
    ).length;

    const notAttemptedProblems = totalProblems - completedProblems - attemptedProblems;

    const completionRate = totalProblems > 0 
      ? Math.round((completedProblems / totalProblems) * 100) 
      : 0;

    const completedWithScores = studentProgress.filter(
      p => p.status === 'completed' && p.bestScore > 0
    );

    const averageScore = completedWithScores.length > 0
      ? Math.round(
          completedWithScores.reduce((sum, p) => sum + p.bestScore, 0) / 
          completedWithScores.length
        )
      : 0;

    const stats = {
      totalProblems,
      completedProblems,
      attemptedProblems,
      notAttemptedProblems,
      
      completionRate,
      completedPercentage: totalProblems > 0 
        ? Math.round((completedProblems / totalProblems) * 100) 
        : 0,
      attemptedPercentage: totalProblems > 0 
        ? Math.round((attemptedProblems / totalProblems) * 100) 
        : 0,
      notAttemptedPercentage: totalProblems > 0 
        ? Math.round((notAttemptedProblems / totalProblems) * 100) 
        : 0,

      averageScore,
      totalScore: completedWithScores.reduce((sum, p) => sum + p.bestScore, 0),

      classCode: classroom.classCode,
      className: classroom.className,

      lastSubmission: studentProgress.length > 0
        ? studentProgress
            .filter(p => p.lastSubmissionAt)
            .sort((a, b) => b.lastSubmissionAt - a.lastSubmissionAt)[0]?.lastSubmissionAt || null
        : null,

      recentCompletions: studentProgress
        .filter(p => p.status === 'completed' && p.completedAt)
        .sort((a, b) => b.completedAt - a.completedAt)
        .slice(0, 5)
        .map(p => ({
          problemShortId: p.problemShortId,
          score: p.bestScore,
          completedAt: p.completedAt
        }))
    };

    return response.sendSuccess(res, stats);
  } catch (error) {
    console.error('❌ Error getting stats:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Get recent activities in classroom
 * Route: GET /api/classroom/class/:classCode/activities
 */
export const getRecentActivities = async (req, res) => {
  try {
    const classroom = req.classroom;
    const { limit = 20 } = req.query;

    const problemShortIds = classroom.problems.map(p => p.problemShortId);

    const recentSubmissions = await submissionModel
      .find({
        problemShortId: { $in: problemShortIds }
      })
      .populate('userId', 'userName fullName avatar')
      .populate('problemId', 'name shortId difficulty')
      .sort({ submittedAt: -1 })
      .limit(parseInt(limit));

    const activities = recentSubmissions.map(submission => ({
      _id: submission._id,
      type: 'submission',
      user: {
        _id: submission.userId._id,
        userName: submission.userId.userName,
        fullName: submission.userId.fullName,
        avatar: submission.userId.avatar
      },
      problem: {
        _id: submission.problemId._id,
        name: submission.problemId.name,
        shortId: submission.problemId.shortId,
        difficulty: submission.problemId.difficulty
      },
      status: submission.status,
      score: submission.score || 0,
      language: submission.language,
      timestamp: submission.submittedAt,
      createdAt: submission.submittedAt
    }));

    const recentJoins = classroom.students
      .filter(s => s.status === 'active')
      .sort((a, b) => b.joinedAt - a.joinedAt)
      .slice(0, 5)
      .map(student => ({
        _id: `join_${student.userId}`,
        type: 'student_joined',
        user: student.userId,
        timestamp: student.joinedAt,
        createdAt: student.joinedAt
      }));

    const recentProblems = classroom.problems
      .sort((a, b) => b.addedAt - a.addedAt)
      .slice(0, 5)
      .map(problem => ({
        _id: `problem_${problem.problemShortId}`,
        type: 'problem_added',
        problemShortId: problem.problemShortId,
        timestamp: problem.addedAt,
        createdAt: problem.addedAt
      }));

    const allActivities = [
      ...activities,
      ...recentJoins,
      ...recentProblems
    ]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, parseInt(limit));

    const populatedActivities = await Promise.all(
      allActivities.map(async (activity) => {
        if (activity.type === 'student_joined' && activity.user) {
          const user = await userModel.findById(activity.user)
            .select('userName fullName avatar');
          return {
            ...activity,
            user: user ? {
              _id: user._id,
              userName: user.userName,
              fullName: user.fullName,
              avatar: user.avatar
            } : null
          };
        }
        
        if (activity.type === 'problem_added') {
          const problem = await problemModel.findOne({ 
            shortId: activity.problemShortId 
          }).select('name shortId difficulty');
          
          return {
            ...activity,
            problem: problem ? {
              _id: problem._id,
              name: problem.name,
              shortId: problem.shortId,
              difficulty: problem.difficulty
            } : null
          };
        }
        
        return activity;
      })
    );

    return response.sendSuccess(res, {
      activities: populatedActivities,
      total: populatedActivities.length,
      classCode: classroom.classCode,
      className: classroom.className
    });
  } catch (error) {
    console.error('❌ Error getting recent activities:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

export default {
  getStats,
  getRecentActivities
};