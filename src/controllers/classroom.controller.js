import response from "../helpers/response.js";
import classroomModel from "../models/classroom.model.js";
import userModel from "../models/user.models.js";
import problemModel from "../models/problem.models.js";

/**
 * Tạo lớp học mới
 * Middleware đã check role admin/teacher
 */
export const createClassroom = async (req, res, next) => {
  try {
    const { className, description, settings } = req.body;
    const userId = req.userId;

    // Tạo mã lớp học unique
    let classCode;
    let isUnique = false;
    while (!isUnique) {
      classCode = classroomModel.generateClassCode();
      const exists = await classroomModel.findOne({ classCode });
      if (!exists) isUnique = true;
    }

    // Tạo lớp học
    const classroom = new classroomModel({
      classCode,
      className,
      description,
      owner: userId,
      settings: settings || {}
    });

    await classroom.save();

    return response.sendSuccess(res, {
      classroom
    }, 'Tạo lớp học thành công');
  } catch (error) {
    console.error('Error creating classroom:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Lấy danh sách lớp học
 */
export const getClassrooms = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status = 'active',
      role // 'teacher' hoặc 'student'
    } = req.query;
    const userId = req.userId;

    const skip = (page - 1) * limit;
    let query = {};

    // Filter theo role
    if (role === 'teacher') {
      query.$or = [
        { owner: userId },
        { teachers: userId }
      ];
    } else if (role === 'student') {
      query['students.userId'] = userId;
      query['students.status'] = 'active';
    } else {
      // Lấy tất cả lớp user tham gia
      query.$or = [
        { owner: userId },
        { teachers: userId },
        { 'students.userId': userId }
      ];
    }

    // Filter theo status
    if (status && status !== 'all') {
      query.status = status;
    }

    const total = await classroomModel.countDocuments(query);
    
    const classrooms = await classroomModel
      .find(query)
      .populate('owner', 'userName fullName avatar')
      .populate('teachers', 'userName fullName avatar')
      .populate('students.userId', 'userName fullName avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    return response.sendSuccess(res, {
      classrooms,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting classrooms:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Lấy chi tiết lớp học với populate problems
 */
export const getClassroomById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const classroom = await classroomModel
      .findById(id)
      .populate('owner', 'userName fullName avatar email')
      .populate('teachers', 'userName fullName avatar email')
      .populate('students.userId', 'userName fullName avatar email');

    if (!classroom) {
      return response.sendError(res, 'Không tìm thấy lớp học', 404);
    }

    // Kiểm tra quyền truy cập
    const isTeacher = classroom.isTeacher(userId);
    const isStudent = classroom.isStudent(userId);

    if (!isTeacher && !isStudent) {
      return response.sendError(res, 'Bạn không có quyền truy cập lớp học này', 403);
    }

    // Populate problems bằng shortId
    const problemShortIds = classroom.problems.map(p => p.problemShortId);
    const problems = await problemModel.find({ shortId: { $in: problemShortIds } });

    // Map problems với thông tin trong classroom
    const problemsWithDetails = classroom.problems.map(cp => {
      const problem = problems.find(p => p.shortId === cp.problemShortId);
      return {
        ...cp.toObject(),
        problem: problem || null
      };
    });

    return response.sendSuccess(res, {
      classroom: {
        ...classroom.toObject(),
        problems: problemsWithDetails
      },
      role: isTeacher ? 'teacher' : 'student'
    });
  } catch (error) {
    console.error('Error getting classroom:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Tham gia lớp học bằng mã
 */
export const joinClassroom = async (req, res, next) => {
  try {
    const { classCode } = req.body;
    const userId = req.userId;

    const classroom = await classroomModel.findOne({ classCode });

    if (!classroom) {
      return response.sendError(res, 'Mã lớp học không đúng', 404);
    }

    if (classroom.status !== 'active') {
      return response.sendError(res, 'Lớp học không còn hoạt động', 400);
    }

    if (!classroom.settings.allowSelfEnroll) {
      return response.sendError(res, 'Lớp học không cho phép tự đăng ký', 403);
    }

    // Kiểm tra đã tham gia chưa
    if (classroom.isStudent(userId) || classroom.isTeacher(userId)) {
      return response.sendError(res, 'Bạn đã tham gia lớp học này', 400);
    }

    // Thêm học sinh
    await classroom.addStudent(userId);

    return response.sendSuccess(res, {
      classroom
    }, 'Tham gia lớp học thành công');
  } catch (error) {
    console.error('Error joining classroom:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Rời lớp học
 */
export const leaveClassroom = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const classroom = await classroomModel.findById(id);

    if (!classroom) {
      return response.sendError(res, 'Không tìm thấy lớp học', 404);
    }

    if (!classroom.isStudent(userId)) {
      return response.sendError(res, 'Bạn không phải học sinh của lớp này', 400);
    }

    await classroom.removeStudent(userId);

    return response.sendSuccess(res, null, 'Rời lớp học thành công');
  } catch (error) {
    console.error('Error leaving classroom:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Thêm bài tập vào lớp - SỬ DỤNG shortId
 * Middleware đã check role admin/teacher
 */
export const addProblemToClassroom = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { problemShortId, dueDate, maxScore, isRequired } = req.body;
    const userId = req.userId;

    const classroom = await classroomModel.findById(id);

    if (!classroom) {
      return response.sendError(res, 'Không tìm thấy lớp học', 404);
    }

    // Kiểm tra có phải teacher của lớp này không
    if (!classroom.isTeacher(userId)) {
      return response.sendError(res, 'Chỉ giáo viên của lớp này mới có thể thêm bài tập', 403);
    }

    // Kiểm tra problem tồn tại bằng shortId
    const problem = await problemModel.findOne({ shortId: problemShortId });
    if (!problem) {
      return response.sendError(res, 'Không tìm thấy bài tập', 404);
    }

    await classroom.addProblem(problemShortId, {
      dueDate,
      maxScore,
      isRequired
    });

    return response.sendSuccess(res, {
      classroom
    }, 'Thêm bài tập thành công');
  } catch (error) {
    console.error('Error adding problem:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Xóa bài tập khỏi lớp - SỬ DỤNG shortId
 * Middleware đã check role admin/teacher
 */
export const removeProblemFromClassroom = async (req, res, next) => {
  try {
    const { id, problemShortId } = req.params;
    const userId = req.userId;

    const classroom = await classroomModel.findById(id);

    if (!classroom) {
      return response.sendError(res, 'Không tìm thấy lớp học', 404);
    }

    // Kiểm tra có phải teacher của lớp này không
    if (!classroom.isTeacher(userId)) {
      return response.sendError(res, 'Chỉ giáo viên của lớp này mới có thể xóa bài tập', 403);
    }

    await classroom.removeProblem(problemShortId);

    return response.sendSuccess(res, {
      classroom
    }, 'Xóa bài tập thành công');
  } catch (error) {
    console.error('Error removing problem:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Cập nhật lớp học
 */
export const updateClassroom = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const updates = req.body;

    const classroom = await classroomModel.findById(id);

    if (!classroom) {
      return response.sendError(res, 'Không tìm thấy lớp học', 404);
    }

    // Chỉ owner mới được update
    if (classroom.owner.toString() !== userId.toString()) {
      return response.sendError(res, 'Chỉ chủ lớp mới có thể cập nhật', 403);
    }

    // Cho phép update các trường
    const allowedFields = ['className', 'description', 'settings', 'status', 'thumbnail'];
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        if (field === 'settings') {
          classroom.settings = { ...classroom.settings, ...updates.settings };
        } else {
          classroom[field] = updates[field];
        }
      }
    });

    await classroom.save();

    return response.sendSuccess(res, {
      classroom
    }, 'Cập nhật lớp học thành công');
  } catch (error) {
    console.error('Error updating classroom:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Xóa lớp học
 */
export const deleteClassroom = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const classroom = await classroomModel.findById(id);

    if (!classroom) {
      return response.sendError(res, 'Không tìm thấy lớp học', 404);
    }

    // Chỉ owner mới được xóa
    if (classroom.owner.toString() !== userId.toString()) {
      return response.sendError(res, 'Chỉ chủ lớp mới có thể xóa', 403);
    }

    await classroomModel.findByIdAndDelete(id);

    return response.sendSuccess(res, null, 'Xóa lớp học thành công');
  } catch (error) {
    console.error('Error deleting classroom:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

export default {
  createClassroom,
  getClassrooms,
  getClassroomById,
  joinClassroom,
  leaveClassroom,
  addProblemToClassroom,
  removeProblemFromClassroom,
  updateClassroom,
  deleteClassroom
};