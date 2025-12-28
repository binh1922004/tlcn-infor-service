import response from "../../helpers/response.js";
import problemModel from "../../models/problem.models.js";
import submissionModel from "../../models/submission.model.js";

/**
 * Thêm bài tập vào lớp
 */
export const addProblemToClassroom = async (req, res, next) => {
  try {
    const { problemShortId, dueDate, maxScore, isRequired } = req.body;
    const classroom = req.classroom;

    if (!problemShortId) {
      return response.sendError(res, 'Mã bài tập là bắt buộc', 400);
    }

    const problem = await problemModel.findOne({ shortId: problemShortId });
    if (!problem) {
      return response.sendError(res, 'Không tìm thấy bài tập', 404);
    }

    const exists = classroom.problems.some(p => p.problemShortId === problemShortId);
    if (exists) {
      return response.sendError(res, 'Bài tập đã có trong lớp học', 400);
    }

    await classroom.addProblem(problemShortId, {
      dueDate,
      maxScore,
      isRequired
    });

    return response.sendSuccess(res, { classroom }, 'Thêm bài tập thành công');
  } catch (error) {
    console.error('Error adding problem:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Update problem settings in classroom
 */
export const updateProblemInClassroom = async (req, res) => {
  try {
    const { problemShortId } = req.params;
    const { maxScore, dueDate, isRequired, order } = req.body;
    const classroom = req.classroom;

    const problemIndex = classroom.problems.findIndex(
      p => p.problemShortId === problemShortId
    );

    if (problemIndex === -1) {
      return response.sendError(res, 'Bài tập không có trong lớp học', 404);
    }

    if (maxScore !== undefined) {
      if (maxScore < 1 || maxScore > 1000) {
        return response.sendError(res, 'Điểm tối đa phải từ 1 đến 1000', 400);
      }
      classroom.problems[problemIndex].maxScore = maxScore;
    }

    if (dueDate !== undefined) {
      classroom.problems[problemIndex].dueDate = dueDate ? new Date(dueDate) : null;
    }

    if (isRequired !== undefined) {
      classroom.problems[problemIndex].isRequired = Boolean(isRequired);
    }

    if (order !== undefined) {
      classroom.problems[problemIndex].order = parseInt(order);
    }

    await classroom.save();

    return response.sendSuccess(
      res, 
      { 
        problem: classroom.problems[problemIndex],
        classroom: {
          classCode: classroom.classCode,
          className: classroom.className
        }
      }, 
      'Cập nhật bài tập thành công'
    );
  } catch (error) {
    console.error('❌ Error updating problem in classroom:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Xóa bài tập khỏi lớp
 */
export const removeProblemFromClassroom = async (req, res, next) => {
  try {
    const { problemShortId } = req.params;
    const classroom = req.classroom;

    const exists = classroom.problems.some(p => p.problemShortId === problemShortId);
    if (!exists) {
      return response.sendError(res, 'Bài tập không có trong lớp học', 404);
    }

    await classroom.removeProblem(problemShortId);

    return response.sendSuccess(res, { classroom }, 'Xóa bài tập thành công');
  } catch (error) {
    console.error('Error removing problem:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Lấy danh sách bài tập của lớp học
 */
export const getClassroomProblems = async (req, res) => {
  try {
    const { name, tag, difficulty, page = 1, size = 20 } = req.query;
    const classroom = req.classroom;

    const problemShortIds = classroom.problems.map(p => p.problemShortId);

    let filter = {
      shortId: { $in: problemShortIds }
    };

    if (name) {
      filter.name = { $regex: name, $options: 'i' };
    }
    if (tag) {
      filter.tags = tag;
    }
    if (difficulty) {
      filter.difficulty = difficulty;
    }

    const pageNumber = parseInt(page);
    const pageSize = parseInt(size);
    const skip = (pageNumber - 1) * pageSize;

    const problems = await problemModel
      .find(filter)
      .select('-numberOfTestCases')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize);

    const problemsWithClassroomInfo = problems.map(problem => {
      const classroomProblem = classroom.problems.find(
        p => p.problemShortId === problem.shortId
      );
      
      return {
        ...problem.toObject(),
        classroomInfo: classroomProblem ? {
          addedAt: classroomProblem.addedAt,
          dueDate: classroomProblem.dueDate,
          maxScore: classroomProblem.maxScore,
          isRequired: classroomProblem.isRequired,
          order: classroomProblem.order
        } : null
      };
    });

    const total = await problemModel.countDocuments(filter);

    return response.sendSuccess(res, {
      items: problemsWithClassroomInfo,
      pagination: {
        total,
        page: pageNumber,
        size: pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (error) {
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Get classroom problems with student progress
 */
export const getClassroomProblemsWithProgress = async (req, res) => {
  try {
    const { classCode } = req.params;
    const userId = req.user._id;
    const { name, tag, difficulty, page = 1, size = 20 } = req.query;

    const classroom = req.classroom;

    const problemShortIds = classroom.problems.map(p => p.problemShortId);

    let filter = {
      shortId: { $in: problemShortIds }
    };

    if (name) {
      filter.name = { $regex: name, $options: 'i' };
    }
    if (tag) {
      filter.tags = tag;
    }
    if (difficulty) {
      filter.difficulty = difficulty;
    }

    const pageNumber = parseInt(page);
    const pageSize = parseInt(size);
    const skip = (pageNumber - 1) * pageSize;

    const problems = await problemModel
      .find(filter)
      .select('-numberOfTestCases')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize);

    const problemsWithProgress = problems.map(problem => {
      const classroomProblem = classroom.problems.find(
        p => p.problemShortId === problem.shortId
      );
      
      const progress = classroom.getStudentProgress(userId, problem.shortId);
      
      return {
        ...problem.toObject(),
        classroomInfo: classroomProblem ? {
          addedAt: classroomProblem.addedAt,
          dueDate: classroomProblem.dueDate,
          maxScore: classroomProblem.maxScore,
          isRequired: classroomProblem.isRequired,
          order: classroomProblem.order
        } : null,
        progress: progress ? {
          status: progress.status,
          bestScore: progress.bestScore,
          lastSubmissionAt: progress.lastSubmissionAt,
          completedAt: progress.completedAt
        } : {
          status: 'not_attempted',
          bestScore: 0,
          lastSubmissionAt: null,
          completedAt: null
        }
      };
    });

    const total = await problemModel.countDocuments(filter);

    return response.sendSuccess(res, {
      items: problemsWithProgress,
      pagination: {
        total,
        page: pageNumber,
        size: pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (error) {
    console.error('❌ Error getting problems with progress:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Get submissions for classroom
 */
export const getSubmissions = async (req, res) => {
  try {
    const classroom = req.classroom;
    const { page = 1, limit = 20, problemShortId, userId } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let filter = {
      classroom: classroom._id
    };

    if (problemShortId) {
      const problem = await problemModel.findOne({ shortId: problemShortId });
      if (problem) {
        filter.problem = problem._id;
      }
    }

    if (userId) {
      filter.user = userId;
    }

    const submissions = await submissionModel
      .find(filter)
      .populate('user', 'userName fullName avatar')
      .populate('problem', 'name shortId difficulty')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await submissionModel.countDocuments(filter);

    return response.sendSuccess(res, {
      submissions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Error getting submissions:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Get problem-specific submissions
 */
export const getProblemSubmissions = async (req, res) => {
  try {
    const { problemShortId } = req.params;
    const classroom = req.classroom;

    const submissions = {
      items: [],
      problemShortId,
      classCode: classroom.classCode
    };

    return response.sendSuccess(res, submissions);
  } catch (error) {
    console.error('Error getting problem submissions:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

export default {
  addProblemToClassroom,
  updateProblemInClassroom,
  removeProblemFromClassroom,
  getClassroomProblems,
  getClassroomProblemsWithProgress,
  getSubmissions,
  getProblemSubmissions
};