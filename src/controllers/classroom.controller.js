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
    const { id } = req.params;
    await classroomModel.findByIdAndDelete(id);
    return response.sendSuccess(res, null, 'Xóa lớp học thành công');
  } catch (error) {
    console.error('Error deleting classroom:', error);
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
    const classroom = req.classroom;

    if (!classroom.isStudent(studentId)) {
      return response.sendError(res, 'Người dùng không phải học sinh của lớp này', 400);
    }

    await classroom.removeStudent(studentId);

    return response.sendSuccess(res, null, 'Xóa học sinh thành công');
  } catch (error) {
    console.error('Error removing student:', error);
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
export const getClassroomByClassCode = async (req, res) => {
  try {
    const { classCode } = req.params;
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

    // ✅ Đếm số lượng tài liệu từ materialModel
    const totalMaterials = await materialModel.countDocuments({
      classroom: classroom._id,
      status: 'active'
    });

    const classroomObj = classroom.toObject();

    return response.sendSuccess(res, {
      classroom: {
        ...classroomObj,
        problems: problemsWithDetails,
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
    
    // Total problems in classroom
    const totalProblems = classroom.problems.length;

    // Get student progress from studentProgress array
    const studentProgress = classroom.studentProgress.filter(
      p => p.userId.toString() === userId.toString()
    );

    // Count by status
    const completedProblems = studentProgress.filter(
      p => p.status === 'completed'
    ).length;

    const attemptedProblems = studentProgress.filter(
      p => p.status === 'attempted'
    ).length;

    const notAttemptedProblems = totalProblems - completedProblems - attemptedProblems;

    // Calculate completion rate
    const completionRate = totalProblems > 0 
      ? Math.round((completedProblems / totalProblems) * 100) 
      : 0;

    // Calculate average score from completed problems
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
      // Problems stats
      totalProblems,
      completedProblems,
      attemptedProblems,
      notAttemptedProblems,
      
      // Percentages
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

      // Score stats
      averageScore,
      totalScore: completedWithScores.reduce((sum, p) => sum + p.bestScore, 0),

      // Classroom info
      classCode: classroom.classCode,
      className: classroom.className,

      // Additional useful info
      lastSubmission: studentProgress.length > 0
        ? studentProgress
            .filter(p => p.lastSubmissionAt)
            .sort((a, b) => b.lastSubmissionAt - a.lastSubmissionAt)[0]?.lastSubmissionAt || null
        : null,

      // Recent completions
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
 * Get leaderboard
 * Route: GET /api/classroom/class/:classCode/leaderboard
 */
export const getLeaderboard = async (req, res) => {
  try {
    const classroom = req.classroom;
    await classroom.populate('students.userId', 'userName fullName avatar');

    // TODO: Implement leaderboard logic with actual submission scores
    const leaderboard = classroom.students
      .filter(s => s.status === 'active')
      .map((student, index) => ({
        rank: index + 1,
        student: {
          _id: student.userId._id,
          userName: student.userId.userName,
          fullName: student.userId.fullName,
          avatar: student.userId.avatar
        },
        totalScore: 0,
        problemsSolved: 0,
        joinedAt: student.joinedAt
      }));

    return response.sendSuccess(res, { 
      items: leaderboard,
      classCode: classroom.classCode,
      className: classroom.className
    });
  } catch (error) {
    console.error(' Error getting leaderboard:', error);
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

    // Get student info
    const student = classroom.students.find(
      s => s.userId.toString() === studentId
    );

    if (!student) {
      return response.sendError(res, 'Học sinh không tồn tại trong lớp', 404);
    }

    // Get all student progress
    const studentProgress = classroom.getStudentAllProgress(studentId);

    // Get problem details
    const problemShortIds = classroom.problems.map(p => p.problemShortId);
    const problems = await problemModel.find({ 
      shortId: { $in: problemShortIds } 
    });

    // Enrich problems with progress
    const problemsWithProgress = classroom.problems.map(cp => {
      const problem = problems.find(p => p.shortId === cp.problemShortId);
      const progress = studentProgress.find(p => p.problemShortId === cp.problemShortId);

      return {
        _id: cp._id,
        shortId: cp.problemShortId,
        name: problem?.name || 'Unknown',
        difficulty: problem?.difficulty || 'medium',
        maxScore: cp.maxScore,
        isRequired: cp.isRequired,
        dueDate: cp.dueDate,
        addedAt: cp.addedAt,
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

    // Calculate stats
    const completedCount = studentProgress.filter(
      p => p.status === 'completed'
    ).length;

    const attemptedCount = studentProgress.filter(
      p => p.status === 'attempted'
    ).length;

    const totalScore = studentProgress
      .filter(p => p.status === 'completed')
      .reduce((sum, p) => sum + p.bestScore, 0);

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
    const { page = 1, limit = 20, problemShortId } = req.query;
    const classroom = req.classroom;

    // Check if student exists
    const student = classroom.students.find(
      s => s.userId.toString() === studentId
    );

    if (!student) {
      return response.sendError(res, 'Học sinh không tồn tại trong lớp', 404);
    }

    // Build query for submissions
    const problemShortIds = classroom.problems.map(p => p.problemShortId);
    
    let query = {
      userId: studentId,
      problemShortId: { $in: problemShortIds }
    };

    if (problemShortId) {
      query.problemShortId = problemShortId;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get submissions from submission model
    const submissions = await submissionModel
      .find(query)
      .populate('problemId', 'name shortId difficulty')
      .sort({ submittedAt: -1 })
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
  getRecentActivities
  
};