import response from "../../helpers/response.js";
import classroomModel from "../../models/classroom.model.js";
import problemModel from "../../models/problem.models.js";
import submissionModel from "../../models/submission.model.js";
import materialModel from "../../models/material.model.js";

/**
 * Tạo lớp học mới
 */
export const createClassroom = async (req, res, next) => {
  try {
    const { className, description, settings } = req.body;
    const userId = req.user._id;

    if (!className) {
      return response.sendError(res, 'Tên lớp học là bắt buộc', 400);
    }

    const classCode = await classroomModel.generateClassCodeFromName(className);
    const inviteCode = await classroomModel.generateInviteCode();

    const classroom = new classroomModel({
      classCode,
      inviteCode,
      className,
      description,
      owner: userId,
      settings: settings || {}
    });

    await classroom.save();

    return response.sendSuccess(res, { classroom }, 'Tạo lớp học thành công');
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
      role
    } = req.query;
    const userId = req.user._id;
    const userRole = req.user.role;

    const skip = (page - 1) * limit;
    let query = {};

    if (userRole === 'admin') {
      // Admin xem tất cả
    } else if (role === 'teacher' || userRole === 'teacher') {
      query.$or = [
        { owner: userId },
        { teachers: userId }
      ];
    } else {
      query['students.userId'] = userId;
      query['students.status'] = 'active';
    }

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

    const classroomsWithStats = classrooms.map(classroom => {
      const classroomObj = classroom.toObject();
      return {
        ...classroomObj,
        stats: {
          totalStudents: classroom.students.filter(s => s.status === 'active').length,
          totalProblems: classroom.problems.length,
          totalTeachers: classroom.teachers.length + 1
        }
      };
    });

    return response.sendSuccess(res, {
      classrooms: classroomsWithStats,
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
 * Lấy chi tiết lớp học
 */
export const getClassroomById = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const classroom = req.classroom;

    await classroom.populate('owner', 'userName fullName avatar email');
    await classroom.populate('teachers', 'userName fullName avatar email');
    await classroom.populate('students.userId', 'userName fullName avatar email');

    const problemShortIds = classroom.problems.map(p => p.problemShortId);
    const problems = await problemModel.find({ shortId: { $in: problemShortIds } });

    const problemsWithDetails = classroom.problems.map(cp => {
      const problem = problems.find(p => p.shortId === cp.problemShortId);
      return {
        ...cp.toObject(),
        problem: problem || null
      };
    });

    const classroomObj = classroom.toObject();

    return response.sendSuccess(res, {
      classroom: {
        ...classroomObj,
        problems: problemsWithDetails,
        stats: {
          totalStudents: classroom.students.filter(s => s.status === 'active').length,
          totalProblems: classroom.problems.length,
          totalTeachers: classroom.teachers.length + 1
        }
      },
      role: req.isTeacher || req.user.role === 'admin' ? 'teacher' : 'student'
    });
  } catch (error) {
    console.error('Error getting classroom:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Get classroom by classCode
 */
export const getClassroomByClassCode = async (req, res) => {
  try {
    const { classCode } = req.params;
    const classroom = req.classroom;
    const userId = req.user._id;

    await classroom.populate('owner', 'userName fullName avatar email');
    await classroom.populate('teachers', 'userName fullName avatar email');
    await classroom.populate('students.userId', 'userName fullName avatar email');

    const problemShortIds = classroom.problems.map(p => p.problemShortId);
    const problems = await problemModel.find({ shortId: { $in: problemShortIds } });
    const problemIds = problems.map(p => p._id);

    const problemsWithDetails = classroom.problems.map(cp => {
      const problem = problems.find(p => p.shortId === cp.problemShortId);
      return {
        ...cp.toObject(),
        problem: problem || null
      };
    });

    const totalMaterials = await materialModel.countDocuments({
      classroom: classroom._id,
      status: 'active'
    });

    const classroomSubmissions = await submissionModel
      .find({
        user: userId,
        classroom: classroom._id,
        problem: { $in: problemIds }
      })
      .sort({ submittedAt: -1 });

    const userProgress = classroom.problems.map(cp => {
      const problem = problems.find(p => p.shortId === cp.problemShortId);
      
      if (!problem) {
        return {
          userId: userId,
          problemShortId: cp.problemShortId,
          status: 'not_attempted',
          bestScore: 0,
          attempts: 0,
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
        userId: userId,
        problemShortId: cp.problemShortId,
        status,
        bestScore: bestSubmission?.score || 0,
        attempts: problemSubmissions.length,
        lastSubmissionAt: problemSubmissions[0]?.submittedAt || null,
        completedAt: bestSubmission?.submittedAt || null
      };
    });

    const classroomObj = classroom.toObject();

    return response.sendSuccess(res, {
      classroom: {
        ...classroomObj,
        problems: problemsWithDetails,
        studentProgress: userProgress,
        stats: {
          totalStudents: classroom.students.filter(s => s.status === 'active').length,
          totalProblems: classroom.problems.length,
          totalTeachers: classroom.teachers.length + 1,
          totalMaterials: totalMaterials 
        }
      },
      role: req.isTeacher || req.user.role === 'admin' ? 'teacher' : 'student'
    });
  } catch (error) {
    console.error('❌ Error getting classroom by classCode:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Cập nhật lớp học
 */
export const updateClassroom = async (req, res, next) => {
  try {
    const updates = req.body;
    const classroom = req.classroom;

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

    return response.sendSuccess(res, { classroom }, 'Cập nhật lớp học thành công');
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
    const classroom = req.classroom; 
    if (!classroom) {
      return response.sendError(res, 'Không tìm thấy lớp học', 404);
    }
    const deletedClassroom = await classroomModel.findByIdAndDelete(classroom._id);

    if (!deletedClassroom) {
      return response.sendError(res, 'Không thể xóa lớp học', 500);
    }
    return response.sendSuccess(res, null, 'Xóa lớp học thành công');
  } catch (error) {
    console.error('❌ Error deleting classroom:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Regenerate invite code
 */
export const regenerateInviteCode = async (req, res, next) => {
  try {
    const classroom = req.classroom;
    await classroom.regenerateInviteCode();
    return response.sendSuccess(res, {
      inviteCode: classroom.inviteCode
    }, 'Tạo lại mã mời thành công');
  } catch (error) {
    console.error('Error regenerating invite code:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

export default {
  createClassroom,
  getClassrooms,
  getClassroomById,
  getClassroomByClassCode,
  updateClassroom,
  deleteClassroom,
  regenerateInviteCode
};