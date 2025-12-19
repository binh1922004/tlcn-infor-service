import response from '../helpers/response.js';
import classroomModel from '../models/classroom.model.js';
import contestModel from '../models/contest.model.js';
import mongoose from 'mongoose';
/**
 * Middleware kiểm tra user có quyền truy cập classroom không
 * Sử dụng cho các route GET classroom detail, students, problems
 */
export const verifyClassroomAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return response.sendError(res, "Unauthenticated", 401);
    }

    const identifier = req.params.id || req.params.classCode;
    const userId = req.user._id;
    const userRole = req.user.role;

    // Admin có quyền truy cập tất cả
    if (userRole === 'admin') {
      let classroom;
      
      if (mongoose.Types.ObjectId.isValid(identifier) && identifier.length === 24) {
        classroom = await classroomModel.findById(identifier);
      } else {
        classroom = await classroomModel.findOne({ 
          classCode: identifier.toUpperCase() 
        });
      }

      if (!classroom) {
        return response.sendError(res, 'Không tìm thấy lớp học', 404);
      }
      
      req.classroom = classroom;
      req.isTeacher = true;
      req.isStudent = false;
      return next();
    }

    // Load classroom
    let classroom;
    
    if (mongoose.Types.ObjectId.isValid(identifier) && identifier.length === 24) {
      classroom = await classroomModel.findById(identifier);
    } else {
      classroom = await classroomModel.findOne({ 
        classCode: identifier.toUpperCase() 
      });
    }

    if (!classroom) {
      return response.sendError(res, 'Không tìm thấy lớp học', 404);
    }

    // Check user có phải teacher hoặc student của lớp này
    const isTeacher = classroom.isTeacher(userId);
    const isStudent = classroom.isStudent(userId);

    if (!isTeacher && !isStudent) {
      return response.sendError(res, 'Bạn không có quyền truy cập lớp học này', 403);
    }

    // Lưu classroom vào req để controller không phải query lại
    req.classroom = classroom;
    req.isTeacher = isTeacher;
    req.isStudent = isStudent;
    
    next();
  } catch (error) {
    console.error('❌ Error in verifyClassroomAccess middleware:', error);
    return response.sendError(res, "Internal server error", 500);
  }
};

/**
 * Middleware kiểm tra user có phải teacher của classroom không
 * Sử dụng cho các action chỉ teacher mới được làm
 * (add/remove problems, add/remove students, invite, create accounts)
 */
export const verifyClassroomTeacher = async (req, res, next) => {
  try {
    if (!req.user) {
      return response.sendError(res, "Unauthenticated", 401);
    }

    const identifier = req.params.id || req.params.classCode;
    const userId = req.user._id;
    const userRole = req.user.role;

    // Admin có full quyền
    if (userRole === 'admin') {
      let classroom;
      
      if (mongoose.Types.ObjectId.isValid(identifier) && identifier.length === 24) {
        classroom = await classroomModel.findById(identifier);
      } else {
        classroom = await classroomModel.findOne({ 
          classCode: identifier.toUpperCase() 
        });
      }

      if (!classroom) {
        return response.sendError(res, 'Không tìm thấy lớp học', 404);
      }
      
      req.classroom = classroom;
      req.isOwner = true;
      return next();
    }

    // Load classroom
    let classroom;
    
    if (mongoose.Types.ObjectId.isValid(identifier) && identifier.length === 24) {
      classroom = await classroomModel.findById(identifier);
    } else {
      classroom = await classroomModel.findOne({ 
        classCode: identifier.toUpperCase() 
      });
    }

    if (!classroom) {
      return response.sendError(res, 'Không tìm thấy lớp học', 404);
    }

    // Check user có phải teacher của lớp này
    if (!classroom.isTeacher(userId)) {
      return response.sendError(res, 'Chỉ giáo viên của lớp này mới có quyền thực hiện', 403);
    }

    // Lưu classroom vào req
    req.classroom = classroom;
    req.isOwner = classroom.owner.toString() === userId.toString();
    
    next();
  } catch (error) {
    console.error('❌ Error in verifyClassroomTeacher middleware:', error);
    return response.sendError(res, "Internal server error", 500);
  }
};


/**
 * Middleware kiểm tra user có phải owner của classroom không
 * Sử dụng cho các action chỉ owner mới được làm 
 * (update, delete, regenerate invite code)
 */
export const verifyClassroomOwner = async (req, res, next) => {
  try {
    if (!req.user) {
      return response.sendError(res, "Unauthenticated", 401);
    }

    const identifier = req.params.id || req.params.classCode;
    const userId = req.user._id;
    const userRole = req.user.role;

    // Admin có full quyền
    if (userRole === 'admin') {
      let classroom;
      
      if (mongoose.Types.ObjectId.isValid(identifier) && identifier.length === 24) {
        classroom = await classroomModel.findById(identifier);
      } else {
        classroom = await classroomModel.findOne({ 
          classCode: identifier.toUpperCase() 
        });
      }

      if (!classroom) {
        return response.sendError(res, 'Không tìm thấy lớp học', 404);
      }
      
      req.classroom = classroom;
      return next();
    }

    // Load classroom
    let classroom;
    
    if (mongoose.Types.ObjectId.isValid(identifier) && identifier.length === 24) {
      classroom = await classroomModel.findById(identifier);
    } else {
      classroom = await classroomModel.findOne({ 
        classCode: identifier.toUpperCase() 
        });
    }

    if (!classroom) {
      return response.sendError(res, 'Không tìm thấy lớp học', 404);
    }

    // Check user có phải owner
    if (classroom.owner.toString() !== userId.toString()) {
      return response.sendError(res, 'Chỉ chủ lớp mới có quyền thực hiện', 403);
    }

    // Lưu classroom vào req
    req.classroom = classroom;
    
    next();
  } catch (error) {
    console.error('❌ Error in verifyClassroomOwner middleware:', error);
    return response.sendError(res, "Internal server error", 500);
  }
};

/**
 * Middleware load classroom info (không check quyền)
 * Dùng cho các route cần classroom nhưng check quyền trong controller
 */
export const loadClassroom = async (req, res, next) => {
  try {
    const identifier = req.params.id || req.params.classCode;
    
    if (!identifier) {
      return response.sendError(res, 'Classroom ID hoặc classCode là bắt buộc', 400);
    }

    let classroom;

    // Check if identifier is MongoDB ObjectId (24 hex characters)
    if (mongoose.Types.ObjectId.isValid(identifier) && identifier.length === 24) {
      classroom = await classroomModel.findById(identifier);
    } else {
      // Treat as classCode
      classroom = await classroomModel.findOne({ 
        classCode: identifier.toUpperCase() 
      });
    }

    if (!classroom) {
      return response.sendError(res, 'Không tìm thấy lớp học', 404);
    }

    req.classroom = classroom;
    next();
  } catch (error) {
    console.error('❌ Error loading classroom:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Middleware check classroom status active
 * Dùng để ngăn action trên classroom đã bị archived/deleted
 */
export const checkClassroomActive = (req, res, next) => {
  try {
    const classroom = req.classroom;

    if (!classroom) {
      return response.sendError(res, 'Classroom chưa được load', 500);
    }

    if (classroom.status !== 'active') {
      return response.sendError(res, 'Lớp học không còn hoạt động', 400);
    }

    next();
  } catch (error) {
    console.error('❌ Error in checkClassroomActive middleware:', error);
    return response.sendError(res, "Internal server error", 500);
  }
};

/**
 * Middleware check classroom settings
 * Kiểm tra settings trước khi thực hiện action
 */
export const checkClassroomSettings = (settingKey) => {
  return (req, res, next) => {
    try {
      const classroom = req.classroom;

      if (!classroom) {
        return response.sendError(res, 'Classroom chưa được load', 500);
      }

      if (!classroom.settings || !classroom.settings[settingKey]) {
        return response.sendError(res, `Tính năng này đã bị tắt`, 403);
      }

      next();
    } catch (error) {
      console.error('❌ Error in checkClassroomSettings middleware:', error);
      return response.sendError(res, "Internal server error", 500);
    }
  };
};

export const verifyClassroomStudentForContest = async (req, res, next) => {
  try {
    if (!req.user) {
      return response.sendError(res, "Unauthenticated", 401);
    }

    const contestId = req.params.id; 
    const userId = req.user._id;
    const userRole = req.user.role;

    //  Validate contestId format
    if (!mongoose.Types.ObjectId.isValid(contestId)) {
      return response.sendError(res, 'ID kỳ thi không hợp lệ', 400);
    }

    // Find contest with classroom
    const contest = await contestModel.findById(contestId).populate('classRoom');
    
    if (!contest) {
      return response.sendError(res, 'Không tìm thấy kỳ thi', 404);
    }

    // Must be a classroom contest
    if (!contest.classRoom) {
      return response.sendError(res, 'Đây không phải là kỳ thi của lớp học', 400);
    }

    const classroom = contest.classRoom;

    // Admin có quyền
    if (userRole === 'admin') {
      req.contest = contest;
      req.classroom = classroom;
      req.isClassroomStudent = true;
      return next();
    }

    // Check if user is active student
    const isActiveStudent = classroom.students.some(
      student => student.userId.toString() === userId.toString() && 
                student.status === 'active'
    );

    if (!isActiveStudent) {
      return response.sendError(
        res, 
        'Bạn phải là học sinh đang học trong lớp này để đăng ký kỳ thi', 
        403
      );
    }

    // Attach data to request
    req.contest = contest;
    req.classroom = classroom;
    req.isClassroomStudent = true;

    next();
  } catch (error) {
    console.error('❌ Error in verifyClassroomStudentForContest:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

export default {
  verifyClassroomAccess,
  verifyClassroomTeacher,
  verifyClassroomOwner,
  loadClassroom,
  checkClassroomActive,
  checkClassroomSettings,
  verifyClassroomStudentForContest
};