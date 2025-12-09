import response from "../helpers/response.js";
import classroomModel from "../models/classroom.model.js";
import userModel from "../models/user.models.js";
import problemModel from "../models/problem.models.js";
import submissionModel from "../models/submission.model.js";
import sendMail from '../utils/sendMail.js';
import materialModel from "../models/material.model.js";
import crypto from 'crypto';
import XLSX from 'xlsx';
/**
 * Tạo lớp học mới
 * Middleware: verifyAdminOrTeacher đã check role
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
 * Middleware đã check quyền access và load classroom
 */
export const getClassroomById = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const classroom = req.classroom; // Đã load từ middleware

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
 * Tham gia lớp học bằng mã
 */
export const joinClassroom = async (req, res, next) => {
  try {
    const { classCode, inviteCode } = req.body;
    const userId = req.user._id;

    if (!classCode && !inviteCode) {
      return response.sendError(res, 'Mã lớp học hoặc mã mời là bắt buộc', 400);
    }

    let classroom;

    if (inviteCode) {
      classroom = await classroomModel.findOne({ 
        inviteCode: inviteCode.toUpperCase().trim() 
      });
    } else if (classCode) {
      classroom = await classroomModel.findOne({ 
        classCode: classCode.toUpperCase().trim() 
      });
    }

    if (!classroom) {
      return response.sendError(res, 'Mã lớp học không đúng', 404);
    }

    if (classroom.status !== 'active') {
      return response.sendError(res, 'Lớp học không còn hoạt động', 400);
    }

    if (!classroom.settings.allowSelfEnroll) {
      return response.sendError(res, 'Lớp học không cho phép tự đăng ký', 403);
    }

    if (classroom.isStudent(userId) || classroom.isTeacher(userId)) {
      return response.sendError(res, 'Bạn đã tham gia lớp học này', 400);
    }

    await classroom.addStudent(userId);

    return response.sendSuccess(res, { classroom }, 'Tham gia lớp học thành công');
  } catch (error) {
    console.error('Error joining classroom:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Rời lớp học
 * Middleware đã load classroom
 */
export const leaveClassroom = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const classroom = req.classroom;

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
 * Thêm bài tập vào lớp
 * Middleware đã check quyền teacher
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
 * Update problem settings in classroom (maxScore, dueDate, isRequired)
 * Route: PATCH /api/classroom/class/:classCode/problems/:problemShortId
 * Middleware đã check quyền teacher
 */
export const updateProblemInClassroom = async (req, res) => {
  try {
    const { problemShortId } = req.params;
    const { maxScore, dueDate, isRequired, order } = req.body;
    const classroom = req.classroom;

    // Find problem in classroom
    const problemIndex = classroom.problems.findIndex(
      p => p.problemShortId === problemShortId
    );

    if (problemIndex === -1) {
      return response.sendError(res, 'Bài tập không có trong lớp học', 404);
    }

    // Update problem settings
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
 * Middleware đã check quyền teacher
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
 * Middleware đã check quyền access
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
 * Cập nhật lớp học
 * Middleware đã check quyền owner
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
 * Middleware đã check quyền owner
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
 * Middleware đã check quyền owner
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

/**
 * Thêm học sinh vào lớp
 * Middleware đã check quyền teacher
 */
export const addStudent = async (req, res) => {
  try {
    const { userId: studentId } = req.body;
    const classroom = req.classroom;

    if (!studentId) {
      return response.sendError(res, 'ID học sinh là bắt buộc', 400);
    }

    const student = await userModel.findById(studentId);
    if (!student) {
      return response.sendError(res, 'Không tìm thấy người dùng', 404);
    }

    if (classroom.isStudent(studentId) || classroom.isTeacher(studentId)) {
      return response.sendError(res, 'Người dùng đã tham gia lớp học này', 400);
    }

    await classroom.addStudent(studentId);

    return response.sendSuccess(res, { classroom }, 'Thêm học sinh thành công');
  } catch (error) {
    console.error('Error adding student:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Xóa học sinh khỏi lớp
 * Middleware đã check quyền teacher
 */
export const removeStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { reason } = req.body; // Lấy lý do xóa từ request body
    const classroom = req.classroom;

    if (!classroom.isStudent(studentId)) {
      return response.sendError(res, 'Người dùng không phải học sinh của lớp này', 400);
    }

    // Lấy thông tin student trước khi xóa
    const student = await userModel.findById(studentId).select('userName fullName email');
    
    if (!student) {
      return response.sendError(res, 'Không tìm thấy học sinh', 404);
    }

    //  Xóa học sinh khỏi lớp
    await classroom.removeStudent(studentId);

    //  Gửi email thông báo
    try {
      const frontendUrl = process.env.FE_LOCALHOST_URL ;
      
      const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(to right, #ef4444, #dc2626); padding: 30px; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0; text-align: center;">
              ⚠️ Thông báo quan trọng
            </h2>
          </div>
          
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
              Xin chào <strong>${student.fullName || student.userName}</strong>,
            </p>
            
            <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 20px 0; border-radius: 4px;">
              <p style="color: #991b1b; font-size: 16px; font-weight: 600; margin: 0 0 10px 0;">
                Bạn đã bị xóa khỏi lớp học
              </p>
              <p style="color: #7f1d1d; margin: 0;">
                <strong>Lớp học:</strong> ${classroom.className}
              </p>
              <p style="color: #7f1d1d; margin: 5px 0 0 0;">
                <strong>Mã lớp:</strong> ${classroom.classCode}
              </p>
            </div>

            ${reason ? `
              <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <p style="color: #92400e; font-weight: 600; margin: 0 0 10px 0;">
                  📝 Lý do:
                </p>
                <p style="color: #78350f; margin: 0; white-space: pre-wrap;">
                  ${reason}
                </p>
              </div>
            ` : ''}

            <div style="margin: 30px 0; padding: 20px; background: #f9fafb; border-radius: 6px;">
              <p style="color: #6b7280; font-size: 14px; margin: 0 0 10px 0;">
                <strong>Điều này có nghĩa là:</strong>
              </p>
              <ul style="color: #6b7280; font-size: 14px; margin: 0; padding-left: 20px;">
                <li>Bạn không còn quyền truy cập vào tài liệu lớp học</li>
                <li>Bạn không thể nộp bài tập của lớp này</li>
                <li>Bạn sẽ không nhận được thông báo từ lớp học này</li>
              </ul>
            </div>

            <div style="background: #dbeafe; border: 1px solid #3b82f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <p style="color: #1e40af; font-size: 14px; margin: 0;">
                💡 <strong>Lưu ý:</strong> Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ với giảng viên hoặc quản trị viên.
              </p>
            </div>

            <div style="text-align: center; margin-top: 30px;">
              <a href="${frontendUrl}/classrooms" 
                 style="background: linear-gradient(to right, #2563eb, #1d4ed8); 
                        color: white; 
                        padding: 12px 30px; 
                        text-decoration: none; 
                        border-radius: 6px;
                        display: inline-block;
                        font-weight: 600;">
                Xem các lớp học khác
              </a>
            </div>
          </div>

          <div style="background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; text-align: center;">
            <p style="color: #6b7280; font-size: 12px; margin: 0;">
              Email này được gửi tự động từ hệ thống Online Judge<br/>
              Vui lòng không trả lời email này
            </p>
          </div>
        </div>
      `;

      await sendMail(
        student.email,
        `Thông báo: Bạn đã bị xóa khỏi lớp học ${classroom.className}`,
        '',
        emailContent
      );

      console.log(` Sent removal notification email to ${student.email}`);
    } catch (emailError) {
      console.error('Error sending removal notification email:', emailError);
      // Không throw error, chỉ log - vì việc xóa đã thành công
    }

    return response.sendSuccess(res, {
      removedStudent: {
        _id: student._id,
        userName: student.userName,
        fullName: student.fullName,
        email: student.email
      },
      reason: reason || null
    }, 'Xóa học sinh thành công và đã gửi email thông báo');
  } catch (error) {
    console.error('❌ Error removing student:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Lấy danh sách học sinh
 * Middleware đã check quyền access
 */
export const getStudents = async (req, res) => {
  try {
    const classroom = req.classroom;

    await classroom.populate('students.userId', 'userName fullName avatar email');

    const students = classroom.students.filter(s => s.status === 'active');

    return response.sendSuccess(res, { students });
  } catch (error) {
    console.error('Error getting students:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Gửi email mời tham gia lớp học
 * Middleware đã check quyền teacher
 */
export const inviteStudentsByEmail = async (req, res) => {
  try {
    const { emails } = req.body;
    const userId = req.user._id;
    const classroom = req.classroom;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return response.sendError(res, 'Danh sách email là bắt buộc', 400);
    }

    const inviteResults = [];
    const frontendUrl = process.env.FE_LOCALHOST_URL || 'http://localhost:5175';

    for (const email of emails) {
      try {
        // Sử dụng method createInviteToken từ schema
        const inviteToken = classroom.createInviteToken(email, userId, 7);
        
        const joinLink = `${frontendUrl}/join-classroom/${classroom.classCode}/${inviteToken}`;

        const emailContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4F46E5;">Lời mời tham gia lớp học</h2>
            <p>Bạn đã được mời tham gia lớp học <strong>${classroom.className}</strong></p>
            <p>${classroom.description || ''}</p>
            
            <div style="margin: 30px 0;">
              <a href="${joinLink}" 
                 style="background: linear-gradient(to right, #2563eb, #9333ea); 
                        color: white; 
                        padding: 12px 24px; 
                        text-decoration: none; 
                        border-radius: 6px;
                        display: inline-block;">
                Tham gia lớp học
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              Hoặc copy link sau vào trình duyệt:<br/>
              <a href="${joinLink}" style="color: #4F46E5;">${joinLink}</a>
            </p>
            
            <p style="color: #666; font-size: 12px; margin-top: 30px;">
              Link này có hiệu lực trong 7 ngày.<br/>
              Nếu bạn chưa có tài khoản, hệ thống sẽ hướng dẫn bạn đăng ký.
            </p>
          </div>
        `;

        await sendMail(
          email,
          `Mời tham gia lớp học: ${classroom.className}`,
          '',
          emailContent
        );

        inviteResults.push({
          email,
          status: 'sent',
          message: 'Email đã được gửi',
          inviteLink: joinLink
        });

      } catch (error) {
        console.error(`Error sending email to ${email}:`, error);
        inviteResults.push({
          email,
          status: 'failed',
          message: error.message
        });
      }
    }

    // Save classroom với tất cả invite tokens
    await classroom.save();

    const successCount = inviteResults.filter(r => r.status === 'sent').length;
    const failCount = inviteResults.filter(r => r.status === 'failed').length;

    return response.sendSuccess(res, {
      results: inviteResults,
      summary: {
        total: emails.length,
        success: successCount,
        failed: failCount
      }
    }, `Đã gửi ${successCount}/${emails.length} email mời`);
  } catch (error) {
    console.error(' Error inviting students by email:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Upload và parse Excel file để lấy danh sách emails
 * Middleware đã check quyền teacher
 */
export const uploadStudentsExcel = async (req, res) => {
  try {
    if (!req.file) {
      return response.sendError(res, 'Vui lòng tải file Excel lên', 400);
    }

    const classroom = req.classroom;

    // Parse Excel file từ buffer
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // Extract emails (giả sử email ở cột đầu tiên)
    const emails = jsonData
      .slice(1) // Bỏ header row
      .map(row => row[0])
      .filter(email => {
        // Validate email format
        if (!email || typeof email !== 'string') return false;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email.trim());
      })
      .map(email => email.toLowerCase().trim());

    // Remove duplicates
    const uniqueEmails = [...new Set(emails)];

    if (uniqueEmails.length === 0) {
      return response.sendError(res, 'Không tìm thấy email hợp lệ trong file', 400);
    }

    return response.sendSuccess(res, {
      emails: uniqueEmails,
      total: uniqueEmails.length,
      fileName: req.file.originalname
    }, `Đã parse ${uniqueEmails.length} email từ file`);

  } catch (error) {
    console.error('Error uploading students Excel:', error);
    
    if (error.message === 'Chỉ chấp nhận file Excel (.xlsx, .xls)') {
      return response.sendError(res, error.message, 400);
    }
    
    return response.sendError(res, 'Lỗi khi đọc file Excel. Vui lòng kiểm tra định dạng file', 500);
  }
};

/**
 * Tạo tài khoản tự động cho học sinh
 * Middleware đã check quyền teacher
 */
export const createStudentAccounts = async (req, res) => {
  try {
    const { emails } = req.body;
    const classroom = req.classroom;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return response.sendError(res, 'Danh sách email là bắt buộc', 400);
    }

    const accountResults = [];
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5175';

    for (const email of emails) {
      try {
        const emailLower = email.toLowerCase().trim();

        const existingUser = await userModel.findOne({ email: emailLower });
        if (existingUser) {
          if (!classroom.isStudent(existingUser._id)) {
            await classroom.addStudent(existingUser._id);
          }
          
          accountResults.push({
            email: emailLower,
            status: 'existing',
            message: 'Tài khoản đã tồn tại, đã thêm vào lớp'
          });
          continue;
        }

        const username = emailLower.split('@')[0] + Math.floor(Math.random() * 1000);
        const passwordLength = Math.floor(Math.random() * 5) + 8;
        const password = crypto.randomBytes(passwordLength).toString('base64').slice(0, passwordLength);

        const newUser = new userModel({
          userName: username,
          email: emailLower,
          password: password,
          fullName: emailLower.split('@')[0],
          role: 'user',
          isVerified: true,
          profile: {
            bio: `Student of ${classroom.className}`
          }
        });

        await newUser.save();
        await classroom.addStudent(newUser._id);

        const emailContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4F46E5;">Chào mừng đến với ${classroom.className}!</h2>
            
            <p>Tài khoản của bạn đã được tạo để tham gia lớp học.</p>
            
            <div style="background: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Thông tin đăng nhập:</h3>
              <p><strong>Username:</strong> ${username}</p>
              <p><strong>Email:</strong> ${emailLower}</p>
              <p><strong>Mật khẩu tạm thời:</strong> <code style="background: #E5E7EB; padding: 4px 8px; border-radius: 4px;">${password}</code></p>
            </div>
            
            <div style="margin: 30px 0;">
              <a href="${frontendUrl}/login" 
                 style="background: linear-gradient(to right, #2563eb, #9333ea); 
                        color: white; 
                        padding: 12px 24px; 
                        text-decoration: none; 
                        border-radius: 6px;
                        display: inline-block;">
                Đăng nhập ngay
              </a>
            </div>
            
            <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0;">
              <strong>⚠️ Lưu ý quan trọng:</strong>
              <p style="margin: 5px 0;">Vui lòng đổi mật khẩu sau lần đăng nhập đầu tiên để bảo mật tài khoản.</p>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              Sau khi đăng nhập, bạn sẽ tự động vào lớp học <strong>${classroom.className}</strong>
            </p>
          </div>
        `;

        await sendMail(
          emailLower,
          `Tài khoản của bạn cho lớp học: ${classroom.className}`,
          '',
          emailContent
        );

        accountResults.push({
          email: emailLower,
          status: 'created',
          username: username,
          message: 'Tài khoản đã được tạo và email đã được gửi'
        });
      } catch (error) {
        console.error(`Error creating account for ${email}:`, error);
        accountResults.push({
          email,
          status: 'failed',
          message: error.message
        });
      }
    }

    const createdCount = accountResults.filter(r => r.status === 'created').length;
    const existingCount = accountResults.filter(r => r.status === 'existing').length;
    const failCount = accountResults.filter(r => r.status === 'failed').length;

    return response.sendSuccess(res, {
      results: accountResults,
      summary: {
        total: emails.length,
        created: createdCount,
        existing: existingCount,
        failed: failCount
      }
    }, `Đã tạo ${createdCount} tài khoản mới, ${existingCount} tài khoản đã tồn tại`);
  } catch (error) {
    console.error('Error creating student accounts:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Verify invite token (Public route)
 */
export const verifyInviteToken = async (req, res) => {
  try {
    const { classCode, token } = req.params;

    if (!classCode || !token) {
      return response.sendError(res, 'Class code và token là bắt buộc', 400);
    }

    const classroom = await classroomModel.findOne({ 
      classCode: classCode.toUpperCase() 
    });

    if (!classroom) {
      return response.sendError(res, 'Không tìm thấy lớp học', 404);
    }

    const invite = classroom.findValidInviteToken(token);

    if (!invite) {
      return response.sendError(res, 'Token không hợp lệ hoặc đã hết hạn', 400);
    }

    // ===== Tìm user để lấy username =====
    const user = await userModel.findOne({ email: invite.email });

    return response.sendSuccess(res, {
      email: invite.email,
      username: user?.userName || null, // ← Thêm username
      classroomName: classroom.className,
      classroomDescription: classroom.description,
      classCode: classroom.classCode
    }, 'Token hợp lệ');
  } catch (error) {
    console.error('❌ Error verifying invite token:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Update checkEmailRegistered to return username
 */
export const checkEmailRegistered = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return response.sendError(res, 'Email là bắt buộc', 400);
    }

    // ===== NEW: Lấy thêm username =====
    const user = await userModel.findOne({ 
      email: email.toLowerCase() 
    }).select('email userName');

    return response.sendSuccess(res, {
      email,
      registered: !!user,
      username: user?.userName || null // ← Thêm username
    }, user ? 'Email đã đăng ký' : 'Email chưa đăng ký');
  } catch (error) {
    console.error('❌ Error checking email:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Join classroom by token
 */
export const joinClassroomByToken = async (req, res) => {
  try {
    const { classCode } = req.params;
    const { token } = req.body;
    
    if (!req.user) {
      return response.sendError(res, 'Unauthorized - Please login', 401);
    }

    const userId = req.user._id || req.user.userId;
    
    // ===== FIX: Lấy username từ req.user hoặc DB =====
    let username = req.user.userName;
    let userEmail = req.user.email;
    
    // Nếu không có đầy đủ info trong req.user, query từ DB
    if (!username || !userEmail) {
      const user = await userModel.findById(userId).select('userName email');
      if (!user) {
        console.error('❌ Cannot find user');
        return response.sendError(res, 'User not found', 400);
      }
      username = user.userName;
      userEmail = user.email;
    }

    if (!token) {
      return response.sendError(res, 'Token là bắt buộc', 400);
    }

    const classroom = await classroomModel.findOne({ 
      classCode: classCode.toUpperCase() 
    });

    if (!classroom) {
      return response.sendError(res, 'Không tìm thấy lớp học', 404);
    }

    // Tìm invite token hợp lệ
    const invite = classroom.findValidInviteToken(token);

    if (!invite) {
      return response.sendError(res, 'Link mời không hợp lệ hoặc đã hết hạn', 400);
    }

    // ===== FIX: So sánh email (từ token) với email của user hiện tại =====
    const inviteEmail = invite.email.toLowerCase().trim();
    const currentUserEmail = userEmail.toLowerCase().trim();


    if (inviteEmail !== currentUserEmail) {
      return response.sendError(
        res, 
        `Email không khớp với lời mời. Vui lòng đăng nhập bằng tài khoản có email: ${invite.email}`, 
        400
      );
    }

    // Check nếu đã là thành viên
    if (classroom.isStudent(userId) || classroom.isTeacher(userId)) {
      // Đánh dấu token đã được sử dụng
      await classroom.markTokenAsUsed(token, userId);

      return response.sendSuccess(res, { 
        classroom: {
          _id: classroom._id,
          classCode: classroom.classCode,
          className: classroom.className,
          description: classroom.description
        },
        alreadyMember: true 
      }, 'Bạn đã là thành viên của lớp này');
    }

    // Thêm học sinh vào lớp
    await classroom.addStudent(userId);

    // Đánh dấu token đã được sử dụng
    await classroom.markTokenAsUsed(token, userId);

    return response.sendSuccess(res, { 
      classroom: {
        _id: classroom._id,
        classCode: classroom.classCode,
        className: classroom.className,
        description: classroom.description
      },
      joined: true 
    }, 'Tham gia lớp học thành công');
  } catch (error) {
    console.error('❌ Error joining classroom by token:', error);
    console.error('   Stack:', error.stack);
    return response.sendError(res, 'Internal server error', 500);
  }
};
// export const getClassroomByClassCode = async (req, res) => {
//   try {
//     const { classCode } = req.params;
//     const classroom = req.classroom; // Đã load từ middleware

//     await classroom.populate('owner', 'userName fullName avatar email');
//     await classroom.populate('teachers', 'userName fullName avatar email');
//     await classroom.populate('students.userId', 'userName fullName avatar email');

//     const problemShortIds = classroom.problems.map(p => p.problemShortId);
//     const problems = await problemModel.find({ shortId: { $in: problemShortIds } });

//     const problemsWithDetails = classroom.problems.map(cp => {
//       const problem = problems.find(p => p.shortId === cp.problemShortId);
//       return {
//         ...cp.toObject(),
//         problem: problem || null
//       };
//     });

//     // ✅ Đếm số lượng tài liệu từ materialModel
//     const totalMaterials = await materialModel.countDocuments({
//       classroom: classroom._id,
//       status: 'active'
//     });

//     const classroomObj = classroom.toObject();

//     return response.sendSuccess(res, {
//       classroom: {
//         ...classroomObj,
//         problems: problemsWithDetails,
//         stats: {
//           totalStudents: classroom.students.filter(s => s.status === 'active').length,
//           totalProblems: classroom.problems.length,
//           totalTeachers: classroom.teachers.length + 1,
//           totalMaterials: totalMaterials 
//         }
//       },
//       role: req.isTeacher || req.user.role === 'admin' ? 'teacher' : 'student'
//     });
//   } catch (error) {
//     console.error('❌ Error getting classroom by classCode:', error);
//     return response.sendError(res, 'Internal server error', 500);
//   }
// };
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

    // ===== FIX: Lấy problemIds (ObjectId) thay vì shortIds =====
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

    // ===== FIX: Query với problem (ObjectId) thay vì problemShortId =====
    const classroomSubmissions = await submissionModel
      .find({
        user: userId,
        classroom: classroom._id,
        problem: { $in: problemIds } // ← Sử dụng problem (ObjectId)
      })
      .sort({ submittedAt: -1 });


    // Build progress cho từng problem
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

      // ===== FIX: Filter bằng problem._id thay vì problemShortId =====
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
        problem: { $in: problemIds } // ← Sử dụng problem
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

      // ===== FIX: Filter bằng problem._id =====
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
 * Get submissions for classroom
 * Route: GET /api/classroom/class/:classCode/submissions
 */
export const getSubmissions = async (req, res) => {
  try {
    const classroom = req.classroom;
    const { page = 1, limit = 20, problemShortId, userId } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Filter submissions by classroom
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
 * Get student-specific submissions
 * Route: GET /api/classroom/class/:classCode/students/:studentId/submissions
 */
// export const getStudentSubmissions = async (req, res) => {
//   try {
//     const { studentId } = req.params;
//     const classroom = req.classroom;
//     // TODO: Implement student submission fetching
//     const submissions = {
//       items: [],
//       student: studentId,
//       classCode: classroom.classCode
//     };

//     return response.sendSuccess(res, submissions);
//   } catch (error) {
//     console.error('Error getting student submissions:', error);
//     return response.sendError(res, 'Internal server error', 500);
//   }
// };
/**
 * Get problem-specific submissions
 * Route: GET /api/classroom/class/:classCode/problems/:problemShortId/submissions
 */
export const getProblemSubmissions = async (req, res) => {
  try {
    const { problemShortId } = req.params;
    const classroom = req.classroom;
    // TODO: Implement problem submission fetching
    const submissions = {
      items: [],
      problemShortId,
      classCode: classroom.classCode
    };

    return response.sendSuccess(res, submissions);
  } catch (error) {
    console.error(' Error getting problem submissions:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};
/**
 * Get classroom problems with student progress
 * Route: GET /api/classroom/class/:classCode/problems/with-progress
 */
export const getClassroomProblemsWithProgress = async (req, res) => {
    try {
        const { classCode } = req.params;
        const userId = req.user._id;
        const { name, tag, difficulty, page = 1, size = 20 } = req.query;

        // Find classroom
        const classroom = await classroomModel.findOne({ classCode });
        if (!classroom) {
            return response.sendError(res, 'Classroom not found', 404);
        }

        // Check if user has access
        const isStudent = classroom.students.some(s => s.userId.toString() === userId.toString());
        const isTeacher = classroom.teachers.some(t => t.toString() === userId.toString());
        
        if (!isStudent && !isTeacher) {
            return response.sendError(res, 'Access denied', 403);
        }

        // Get problem short IDs from classroom
        const problemShortIds = classroom.problems.map(p => p.problemShortId);

        // Build filter
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

        // Pagination
        const pageNumber = parseInt(page);
        const pageSize = parseInt(size);
        const skip = (pageNumber - 1) * pageSize;

        // Get problems
        const problems = await problemModel
            .find(filter)
            .select('-numberOfTestCases')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(pageSize);

        // ✅ Enrich with classroom info + student progress
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
                // ✅ Student progress
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
    
    // ===== FIX: Lấy problemIds =====
    const problemIds = problems.map(p => p._id);

    // ===== FIX: Query với problem (ObjectId) =====
    const allClassroomSubmissions = await submissionModel
      .find({
        classroom: classroom._id,
        problem: { $in: problemIds } // ← Sử dụng problem
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

          // ===== FIX: Filter bằng problem._id =====
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

    // Sort leaderboard
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
      default: // totalScore
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

/**
 * Get grade book (bảng điểm chi tiết)
 * Route: GET /api/classroom/class/:classCode/gradebook
 */
export const getGradeBook = async (req, res) => {
  try {
    const classroom = req.classroom;
    const { studentId } = req.query;

    await classroom.populate('students.userId', 'userName fullName avatar email');

    // Get problem details
    const problemShortIds = classroom.problems.map(p => p.problemShortId);
    const problems = await problemModel.find({ 
      shortId: { $in: problemShortIds } 
    }).select('name shortId difficulty');

    // Build grade book
    let students = classroom.students.filter(s => s.status === 'active');
    
    if (studentId) {
      students = students.filter(s => s.userId._id.toString() === studentId);
    }

    const gradeBook = students.map(student => {
      const userId = student.userId._id;
      const userProgress = classroom.studentProgress.filter(
        p => p.userId.toString() === userId.toString()
      );

      // Build problem scores
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

      // Calculate totals
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

    // Prepare data for Excel
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

    // Create workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Auto-size columns
    const maxWidth = headers.map((h, i) => {
      const columnValues = [h, ...rows.map(r => String(r[i] || ''))];
      return Math.max(...columnValues.map(v => v.length)) + 2;
    });

    worksheet['!cols'] = maxWidth.map(w => ({ wch: Math.min(w, 50) }));

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Bảng điểm');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="BangDiem_${classroom.classCode}_${Date.now()}.xlsx"`);

    return res.send(buffer);
  } catch (error) {
    console.error('❌ Error exporting grade book:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

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

    // Lấy problemIds
    const problemIds = problems.map(p => p._id);

    // Query submissions với problem (ObjectId)
    const classroomSubmissions = await submissionModel
      .find({
        user: studentId,
        classroom: classroom._id,
        problem: { $in: problemIds }
      })
      .sort({ submittedAt: -1 });

    console.log(`📊 Found ${classroomSubmissions.length} submissions for student`);

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

      // Filter submissions cho problem này
      const problemSubmissions = classroomSubmissions.filter(
        s => s.problem.toString() === problem._id.toString()
      );

      console.log(`📝 Problem ${problem.shortId}: ${problemSubmissions.length} submissions`);

      // ===== FIX: Tính điểm dựa trên testcase passed =====
      const submissionsWithScores = problemSubmissions.map(sub => {
        let calculatedScore = 0;

        if (sub.status === 'Accepted' || sub.status === 'AC') {
          // AC = 100% điểm
          calculatedScore = cp.maxScore || 100;
        } else if (sub.testCasesPassed && problem.numberOfTestCases) {
          // Tính % dựa trên testcase passed
          const percentage = sub.testCasesPassed / problem.numberOfTestCases;
          calculatedScore = Math.round(percentage * (cp.maxScore || 100));
        } else if (sub.score !== undefined && sub.score !== null) {
          // Fallback: dùng score có sẵn
          calculatedScore = sub.score;
        }

        console.log(`   Submission ${sub._id}:`, {
          status: sub.status,
          testCasesPassed: sub.testCasesPassed,
          totalTestCases: problem.numberOfTestCases,
          originalScore: sub.score,
          calculatedScore
        });

        return {
          ...sub.toObject(),
          calculatedScore
        };
      });

      // Lấy submission có điểm cao nhất
      const bestSubmission = submissionsWithScores.sort((a, b) => {
        return b.calculatedScore - a.calculatedScore;
      })[0];

      // Xác định status
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

      console.log(`   ✅ Progress for ${problem.shortId}:`, progressData);

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

    console.log('📈 Final stats:', stats);

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
      sortBy = 'submittedAt', // submittedAt, status, passed
      sortOrder = 'desc' // desc, asc
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
    
    // Build query
    let query = {
      user: studentId,
      classroom: classroom._id,
      problem: { $in: problemIds }
    };

    // Filter by specific problem
    if (problemShortId) {
      const specificProblem = await problemModel.findOne({ shortId: problemShortId });
      if (specificProblem) {
        query.problem = specificProblem._id;
      }
    }

    // Build sort object
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

    // Verify student belongs to classroom
    const student = classroom.students.find(
      s => s.userId.toString() === studentId
    );

    if (!student) {
      return response.sendError(res, 'Học sinh không tồn tại trong lớp', 404);
    }

    // Get submission
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

    // Calculate score based on test cases
    let calculatedScore = 0;
    if (submission.status === 'Accepted' || submission.status === 'AC') {
      calculatedScore = 100;
    } else if (submission.testCasesPassed && submission.problem?.numberOfTestCases) {
      const percentage = submission.testCasesPassed / submission.problem.numberOfTestCases;
      calculatedScore = Math.round(percentage * 100);
    }

    // Get classroom problem info for maxScore
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
 * Get recent activities in classroom
 * Route: GET /api/classroom/class/:classCode/activities
 */
export const getRecentActivities = async (req, res) => {
  try {
    const classroom = req.classroom;
    const { limit = 20 } = req.query;

    // Get problem short IDs
    const problemShortIds = classroom.problems.map(p => p.problemShortId);

    // Get recent submissions for this classroom
    const recentSubmissions = await submissionModel
      .find({
        problemShortId: { $in: problemShortIds }
      })
      .populate('userId', 'userName fullName avatar')
      .populate('problemId', 'name shortId difficulty')
      .sort({ submittedAt: -1 })
      .limit(parseInt(limit));

    // Transform to activities format
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

    // Add student join activities
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

    // Add problem added activities
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

    // Merge all activities and sort by timestamp
    const allActivities = [
      ...activities,
      ...recentJoins,
      ...recentProblems
    ]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, parseInt(limit));

    // Populate user info for join activities if needed
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
  createClassroom,
  getClassrooms,
  getClassroomById,
  getClassroomByClassCode,  
  joinClassroom,
  leaveClassroom,
  addProblemToClassroom,
  updateProblemInClassroom,
  removeProblemFromClassroom,
  getClassroomProblems,
  updateClassroom,
  deleteClassroom,
  regenerateInviteCode,
  addStudent,
  removeStudent,
  getStudents,
  uploadStudentsExcel,
  inviteStudentsByEmail,
  createStudentAccounts,
  verifyInviteToken,
  checkEmailRegistered,
  joinClassroomByToken,
  getStats, 
  getSubmissions,  
  getStudentSubmissions,  
  getProblemSubmissions,  
  getLeaderboard,
  getClassroomProblemsWithProgress,
  getStudentProgress,
  getRecentActivities,
  getGradeBook,
  exportGradeBook,
  getSubmissionDetail
  
};