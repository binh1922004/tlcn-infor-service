import response from "../../helpers/response.js";
import problemModel from "../../models/problem.models.js";
import submissionModel from "../../models/submission.model.js";
import XLSX from 'xlsx';

/**
 * Get student progress in classroom
 * Route: GET /api/classroom/class/:classCode/students/:studentId/progress
 */
export const getStudentProgress = async (req, res) => {
  try {
    const { studentId } = req.params;
    const classroom = req.classroom;

    const student = classroom.students.find(
      s => s.userId.toString() === studentId
    );

    if (!student) {
      return response.sendError(res, 'Học sinh không tồn tại trong lớp', 404);
    }

    const problemShortIds = classroom.problems.map(p => p.problemShortId);
    const problems = await problemModel.find({ 
      shortId: { $in: problemShortIds } 
    });

    const problemIds = problems.map(p => p._id);

    const classroomSubmissions = await submissionModel
      .find({
        user: studentId,
        classroom: classroom._id,
        problem: { $in: problemIds }
      })
      .sort({ submittedAt: -1 });

    const problemsWithProgress = classroom.problems.map(cp => {
      const problem = problems.find(p => p.shortId === cp.problemShortId);
      
      if (!problem) {
        return {
          _id: cp._id,
          shortId: cp.problemShortId,
          name: 'Unknown',
          difficulty: 'medium',
          maxScore: cp.maxScore,
          isRequired: cp.isRequired,
          dueDate: cp.dueDate,
          addedAt: cp.addedAt,
          progress: {
            status: 'not_attempted',
            bestScore: 0,
            attempts: 0,
            lastSubmissionAt: null,
            completedAt: null
          }
        };
      }

      const problemSubmissions = classroomSubmissions.filter(
        s => s.problem.toString() === problem._id.toString()
      );

      const submissionsWithScores = problemSubmissions.map(sub => {
        let calculatedScore = 0;

        if (sub.status === 'Accepted' || sub.status === 'AC') {
          calculatedScore = cp.maxScore || 100;
        } else if (sub.testCasesPassed && problem.numberOfTestCases) {
          const percentage = sub.testCasesPassed / problem.numberOfTestCases;
          calculatedScore = Math.round(percentage * (cp.maxScore || 100));
        } else if (sub.score !== undefined && sub.score !== null) {
          calculatedScore = sub.score;
        }

        return {
          ...sub.toObject(),
          calculatedScore
        };
      });

      const bestSubmission = submissionsWithScores.sort((a, b) => {
        return b.calculatedScore - a.calculatedScore;
      })[0];

      let status = 'not_attempted';
      if (submissionsWithScores.some(s => s.status === 'Accepted' || s.status === 'AC')) {
        status = 'completed';
      } else if (problemSubmissions.length > 0) {
        status = 'attempted';
      }

      const progressData = {
        status,
        bestScore: bestSubmission?.calculatedScore || 0,
        attempts: problemSubmissions.length,
        lastSubmissionAt: problemSubmissions[0]?.submittedAt || null,
        completedAt: (status === 'completed' && bestSubmission) ? bestSubmission.submittedAt : null
      };

      return {
        _id: cp._id,
        shortId: cp.problemShortId,
        name: problem.name,
        difficulty: problem.difficulty,
        maxScore: cp.maxScore,
        isRequired: cp.isRequired,
        dueDate: cp.dueDate,
        addedAt: cp.addedAt,
        progress: progressData
      };
    });

    const completedCount = problemsWithProgress.filter(
      p => p.progress.status === 'completed'
    ).length;

    const attemptedCount = problemsWithProgress.filter(
      p => p.progress.status === 'attempted'
    ).length;

    const totalScore = problemsWithProgress
      .filter(p => p.progress.status === 'completed')
      .reduce((sum, p) => sum + p.progress.bestScore, 0);

    const stats = {
      totalProblems: classroom.problems.length,
      completedProblems: completedCount,
      attemptedProblems: attemptedCount,
      notAttemptedProblems: classroom.problems.length - completedCount - attemptedCount,
      totalScore,
      averageScore: completedCount > 0 ? Math.round(totalScore / completedCount) : 0,
      completionRate: classroom.problems.length > 0 
        ? Math.round((completedCount / classroom.problems.length) * 100) 
        : 0
    };

    return response.sendSuccess(res, {
      problems: problemsWithProgress,
      stats,
      student: {
        userId: student.userId,
        joinedAt: student.joinedAt,
        status: student.status
      }
    });
  } catch (error) {
    console.error('❌ Error getting student progress:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Get student submissions in classroom
 * Route: GET /api/classroom/class/:classCode/students/:studentId/submissions
 */
export const getStudentSubmissions = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { 
      page = 1, 
      limit = 20, 
      problemShortId,
      sortBy = 'submittedAt',
      sortOrder = 'desc'
    } = req.query;
    const classroom = req.classroom;

    const student = classroom.students.find(
      s => s.userId.toString() === studentId
    );

    if (!student) {
      return response.sendError(res, 'Học sinh không tồn tại trong lớp', 404);
    }

    const problemShortIds = classroom.problems.map(p => p.problemShortId);
    const problems = await problemModel.find({ shortId: { $in: problemShortIds } });
    
    const problemIds = problems.map(p => p._id);
    
    let query = {
      user: studentId,
      classroom: classroom._id,
      problem: { $in: problemIds }
    };

    if (problemShortId) {
      const specificProblem = await problemModel.findOne({ shortId: problemShortId });
      if (specificProblem) {
        query.problem = specificProblem._id;
      }
    }

    let sortObj = {};
    switch (sortBy) {
      case 'status':
        sortObj.status = sortOrder === 'asc' ? 1 : -1;
        break;
      case 'passed':
        sortObj.testCasesPassed = sortOrder === 'asc' ? 1 : -1;
        break;
      case 'time':
        sortObj.time = sortOrder === 'asc' ? 1 : -1;
        break;
      case 'memory':
        sortObj.memory = sortOrder === 'asc' ? 1 : -1;
        break;
      case 'submittedAt':
      default:
        sortObj.submittedAt = sortOrder === 'asc' ? 1 : -1;
        break;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const submissions = await submissionModel
      .find(query)
      .populate('problem', 'name shortId difficulty') 
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await submissionModel.countDocuments(query);

    return response.sendSuccess(res, {
      submissions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      },
      filters: {
        problemShortId: problemShortId || null,
        sortBy,
        sortOrder
      },
      student: {
        userId: student.userId,
        joinedAt: student.joinedAt,
        status: student.status
      }
    });
  } catch (error) {
    console.error('❌ Error getting student submissions:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Get submission detail
 * Route: GET /api/classroom/class/:classCode/students/:studentId/submissions/:submissionId
 */
export const getSubmissionDetail = async (req, res) => {
  try {
    const { studentId, submissionId } = req.params;
    const classroom = req.classroom;

    const student = classroom.students.find(
      s => s.userId.toString() === studentId
    );

    if (!student) {
      return response.sendError(res, 'Học sinh không tồn tại trong lớp', 404);
    }

    const submission = await submissionModel
      .findOne({
        _id: submissionId,
        user: studentId,
        classroom: classroom._id
      })
      .populate('problem', 'name shortId difficulty numberOfTestCases')
      .populate('user', 'userName fullName avatar email');

    if (!submission) {
      return response.sendError(res, 'Không tìm thấy bài nộp', 404);
    }

    let calculatedScore = 0;
    if (submission.status === 'Accepted' || submission.status === 'AC') {
      calculatedScore = 100;
    } else if (submission.testCasesPassed && submission.problem?.numberOfTestCases) {
      const percentage = submission.testCasesPassed / submission.problem.numberOfTestCases;
      calculatedScore = Math.round(percentage * 100);
    }

    const classroomProblem = classroom.problems.find(
      p => p.problemShortId === submission.problem.shortId
    );

    return response.sendSuccess(res, {
      submission: {
        ...submission.toObject(),
        calculatedScore,
        maxScore: classroomProblem?.maxScore || 100
      },
      classroom: {
        classCode: classroom.classCode,
        className: classroom.className
      },
      student: {
        _id: student.userId,
        userName: submission.user?.userName,
        fullName: submission.user?.fullName,
        avatar: submission.user?.avatar
      }
    });
  } catch (error) {
    console.error('❌ Error getting submission detail:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Get grade book (bảng điểm chi tiết)
 * Route: GET /api/classroom/class/:classCode/gradebook
 */
export const getGradeBook = async (req, res) => {
  try {
    const classroom = req.classroom;
    const { studentId } = req.query;

    await classroom.populate('students.userId', 'userName fullName avatar email');

    const problemShortIds = classroom.problems.map(p => p.problemShortId);
    const problems = await problemModel.find({ 
      shortId: { $in: problemShortIds } 
    }).select('name shortId difficulty');

    let students = classroom.students.filter(s => s.status === 'active');
    
    if (studentId) {
      students = students.filter(s => s.userId._id.toString() === studentId);
    }

    const gradeBook = students.map(student => {
      const userId = student.userId._id;
      const userProgress = classroom.studentProgress.filter(
        p => p.userId.toString() === userId.toString()
      );

      const problemScores = classroom.problems.map(cp => {
        const problem = problems.find(p => p.shortId === cp.problemShortId);
        const progress = userProgress.find(p => p.problemShortId === cp.problemShortId);

        return {
          problemShortId: cp.problemShortId,
          problemName: problem?.name || 'Unknown',
          difficulty: problem?.difficulty || 'medium',
          maxScore: cp.maxScore,
          isRequired: cp.isRequired,
          dueDate: cp.dueDate,
          score: progress?.bestScore || 0,
          status: progress?.status || 'not_attempted',
          completedAt: progress?.completedAt || null,
          percentage: cp.maxScore > 0 
            ? Math.round((progress?.bestScore || 0) / cp.maxScore * 100)
            : 0
        };
      });

      const completedProblems = problemScores.filter(p => p.status === 'completed').length;
      const totalScore = problemScores.reduce((sum, p) => sum + p.score, 0);
      const maxPossibleScore = problemScores.reduce((sum, p) => sum + p.maxScore, 0);
      const averagePercentage = maxPossibleScore > 0
        ? Math.round((totalScore / maxPossibleScore) * 100)
        : 0;

      return {
        student: {
          _id: student.userId._id,
          userName: student.userId.userName,
          fullName: student.userId.fullName,
          avatar: student.userId.avatar,
          email: student.userId.email
        },
        joinedAt: student.joinedAt,
        problemScores,
        summary: {
          totalProblems: classroom.problems.length,
          completedProblems,
          attemptedProblems: problemScores.filter(p => p.status === 'attempted').length,
          notAttemptedProblems: problemScores.filter(p => p.status === 'not_attempted').length,
          totalScore,
          maxPossibleScore,
          averagePercentage,
          completionRate: Math.round((completedProblems / classroom.problems.length) * 100)
        }
      };
    });

    return response.sendSuccess(res, {
      gradeBook,
      classroom: {
        _id: classroom._id,
        classCode: classroom.classCode,
        className: classroom.className
      },
      problems: classroom.problems.map(cp => {
        const problem = problems.find(p => p.shortId === cp.problemShortId);
        return {
          shortId: cp.problemShortId,
          name: problem?.name || 'Unknown',
          difficulty: problem?.difficulty,
          maxScore: cp.maxScore,
          isRequired: cp.isRequired,
          dueDate: cp.dueDate,
          order: cp.order
        };
      }),
      statistics: {
        totalStudents: gradeBook.length,
        totalProblems: classroom.problems.length,
        averageCompletionRate: gradeBook.length > 0
          ? Math.round(
              gradeBook.reduce((sum, g) => sum + g.summary.completionRate, 0) / gradeBook.length
            )
          : 0,
        averageScore: gradeBook.length > 0
          ? Math.round(
              gradeBook.reduce((sum, g) => sum + g.summary.totalScore, 0) / gradeBook.length
            )
          : 0
      }
    });
  } catch (error) {
    console.error('❌ Error getting grade book:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Export grade book to Excel
 * Route: GET /api/classroom/class/:classCode/gradebook/export
 */
export const exportGradeBook = async (req, res) => {
  try {
    const classroom = req.classroom;

    await classroom.populate('students.userId', 'userName fullName email');

    const problemShortIds = classroom.problems.map(p => p.problemShortId);
    const problems = await problemModel.find({ 
      shortId: { $in: problemShortIds } 
    }).select('name shortId');

    const headers = [
      'STT',
      'Họ và tên',
      'Email',
      'Username',
      ...classroom.problems.map(cp => {
        const problem = problems.find(p => p.shortId === cp.problemShortId);
        return problem?.name || cp.problemShortId;
      }),
      'Tổng điểm',
      'Hoàn thành',
      'Tỷ lệ (%)'
    ];

    const rows = classroom.students
      .filter(s => s.status === 'active')
      .map((student, index) => {
        const userId = student.userId._id;
        const userProgress = classroom.studentProgress.filter(
          p => p.userId.toString() === userId.toString()
        );

        const problemScores = classroom.problems.map(cp => {
          const progress = userProgress.find(p => p.problemShortId === cp.problemShortId);
          return progress?.bestScore || 0;
        });

        const totalScore = problemScores.reduce((sum, score) => sum + score, 0);
        const completedCount = userProgress.filter(p => p.status === 'completed').length;
        const completionRate = Math.round((completedCount / classroom.problems.length) * 100);

        return [
          index + 1,
          student.userId.fullName || student.userId.userName,
          student.userId.email,
          student.userId.userName,
          ...problemScores,
          totalScore,
          completedCount,
          completionRate
        ];
      });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    const maxWidth = headers.map((h, i) => {
      const columnValues = [h, ...rows.map(r => String(r[i] || ''))];
      return Math.max(...columnValues.map(v => v.length)) + 2;
    });

    worksheet['!cols'] = maxWidth.map(w => ({ wch: Math.min(w, 50) }));

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Bảng điểm');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="BangDiem_${classroom.classCode}_${Date.now()}.xlsx"`);

    return res.send(buffer);
  } catch (error) {
    console.error('❌ Error exporting grade book:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Get detailed leaderboard with scores
 * Route: GET /api/classroom/class/:classCode/leaderboard
 */
export const getLeaderboard = async (req, res) => {
  try {
    const classroom = req.classroom;
    const { sortBy = 'totalScore' } = req.query;

    await classroom.populate('students.userId', 'userName fullName avatar');

    const problemShortIds = classroom.problems.map(p => p.problemShortId);
    const problems = await problemModel.find({ shortId: { $in: problemShortIds } });
    const problemIds = problems.map(p => p._id);

    const allClassroomSubmissions = await submissionModel
      .find({
        classroom: classroom._id,
        problem: { $in: problemIds }
      })
      .sort({ submittedAt: -1 });

    const leaderboardData = classroom.students
      .filter(s => s.status === 'active')
      .map((student) => {
        const userId = student.userId._id;
        
        const userSubmissions = allClassroomSubmissions.filter(
          sub => sub.user.toString() === userId.toString()
        );

        const userProgress = classroom.problems.map(cp => {
          const problem = problems.find(p => p.shortId === cp.problemShortId);
          
          if (!problem) {
            return {
              problemShortId: cp.problemShortId,
              status: 'not_attempted',
              bestScore: 0,
              completedAt: null,
              lastSubmissionAt: null
            };
          }

          const problemSubmissions = userSubmissions.filter(
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
            problemShortId: cp.problemShortId,
            status,
            bestScore: bestSubmission?.score || 0,
            completedAt: bestSubmission?.submittedAt || null,
            lastSubmissionAt: problemSubmissions[0]?.submittedAt || null
          };
        });

        const completedProblems = userProgress.filter(p => p.status === 'completed').length;
        const attemptedProblems = userProgress.filter(p => p.status === 'attempted').length;
        
        const totalScore = userProgress
          .filter(p => p.status === 'completed')
          .reduce((sum, p) => sum + p.bestScore, 0);

        const averageScore = completedProblems > 0 
          ? Math.round(totalScore / completedProblems) 
          : 0;

        const completionRate = classroom.problems.length > 0
          ? Math.round((completedProblems / classroom.problems.length) * 100)
          : 0;

        const lastSubmission = userProgress
          .filter(p => p.lastSubmissionAt)
          .sort((a, b) => b.lastSubmissionAt - a.lastSubmissionAt)[0]?.lastSubmissionAt || null;

        return {
          student: {
            _id: student.userId._id,
            userName: student.userId.userName,
            fullName: student.userId.fullName,
            avatar: student.userId.avatar
          },
          totalScore,
          problemsSolved: completedProblems,
          problemsAttempted: attemptedProblems,
          averageScore,
          completionRate,
          joinedAt: student.joinedAt,
          lastSubmission,
          problemProgress: userProgress
        };
      });

    let sortedLeaderboard;
    switch (sortBy) {
      case 'problemsSolved':
        sortedLeaderboard = leaderboardData.sort((a, b) => {
          if (b.problemsSolved === a.problemsSolved) {
            return b.totalScore - a.totalScore;
          }
          return b.problemsSolved - a.problemsSolved;
        });
        break;
      case 'averageScore':
        sortedLeaderboard = leaderboardData.sort((a, b) => {
          if (b.averageScore === a.averageScore) {
            return b.problemsSolved - a.problemsSolved;
          }
          return b.averageScore - a.averageScore;
        });
        break;
      case 'completionRate':
        sortedLeaderboard = leaderboardData.sort((a, b) => {
          if (b.completionRate === a.completionRate) {
            return b.totalScore - a.totalScore;
          }
          return b.completionRate - a.completionRate;
        });
        break;
      default:
        sortedLeaderboard = leaderboardData.sort((a, b) => {
          if (b.totalScore === a.totalScore) {
            return b.problemsSolved - a.problemsSolved;
          }
          return b.totalScore - a.totalScore;
        });
    }

    const leaderboardWithRank = sortedLeaderboard.map((item, index) => ({
      rank: index + 1,
      ...item
    }));

    return response.sendSuccess(res, { 
      items: leaderboardWithRank,
      total: leaderboardWithRank.length,
      classCode: classroom.classCode,
      className: classroom.className,
      totalProblems: classroom.problems.length,
      sortBy
    });
  } catch (error) {
    console.error('❌ Error getting leaderboard:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

export default {
  getStudentProgress,
  getStudentSubmissions,
  getSubmissionDetail,
  getGradeBook,
  exportGradeBook,
  getLeaderboard
};