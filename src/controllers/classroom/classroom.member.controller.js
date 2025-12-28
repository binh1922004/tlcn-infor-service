import response from "../../helpers/response.js";
import classroomModel from "../../models/classroom.model.js";
import userModel from "../../models/user.models.js";
import sendMail from '../../utils/sendMail.js';
import crypto from 'crypto';
import XLSX from 'xlsx';

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
 * Thêm học sinh vào lớp
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
 */
export const removeStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { reason } = req.body;
    const classroom = req.classroom;

    if (!classroom.isStudent(studentId)) {
      return response.sendError(res, 'Người dùng không phải học sinh của lớp này', 400);
    }

    const student = await userModel.findById(studentId).select('userName fullName email');
    
    if (!student) {
      return response.sendError(res, 'Không tìm thấy học sinh', 404);
    }

    await classroom.removeStudent(studentId);

    // Send email notification
    try {
      const frontendUrl = process.env.FE_LOCALHOST_URL;
      
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
        </div>
      `;

      await sendMail(
        student.email,
        `Thông báo: Bạn đã bị xóa khỏi lớp học ${classroom.className}`,
        '',
        emailContent
      );
    } catch (emailError) {
      console.error('Error sending removal notification email:', emailError);
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
            
            <p style="color: #666; font-size: 12px; margin-top: 30px;">
              Link này có hiệu lực trong 7 ngày.
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
    console.error('Error inviting students by email:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Upload Excel file để lấy danh sách emails
 */
export const uploadStudentsExcel = async (req, res) => {
  try {
    if (!req.file) {
      return response.sendError(res, 'Vui lòng tải file Excel lên', 400);
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    const emails = jsonData
      .slice(1)
      .map(row => row[0])
      .filter(email => {
        if (!email || typeof email !== 'string') return false;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email.trim());
      })
      .map(email => email.toLowerCase().trim());

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
    return response.sendError(res, 'Lỗi khi đọc file Excel', 500);
  }
};

/**
 * Tạo tài khoản tự động cho học sinh
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
 * Verify invite token
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

    const user = await userModel.findOne({ email: invite.email });

    return response.sendSuccess(res, {
      email: invite.email,
      username: user?.userName || null,
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
 * Check if email is registered
 */
export const checkEmailRegistered = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return response.sendError(res, 'Email là bắt buộc', 400);
    }

    const user = await userModel.findOne({ 
      email: email.toLowerCase() 
    }).select('email userName');

    return response.sendSuccess(res, {
      email,
      registered: !!user,
      username: user?.userName || null
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
    
    let username = req.user.userName;
    let userEmail = req.user.email;
    
    if (!username || !userEmail) {
      const user = await userModel.findById(userId).select('userName email');
      if (!user) {
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

    const invite = classroom.findValidInviteToken(token);

    if (!invite) {
      return response.sendError(res, 'Link mời không hợp lệ hoặc đã hết hạn', 400);
    }

    const inviteEmail = invite.email.toLowerCase().trim();
    const currentUserEmail = userEmail.toLowerCase().trim();

    if (inviteEmail !== currentUserEmail) {
      return response.sendError(
        res, 
        `Email không khớp với lời mời. Vui lòng đăng nhập bằng tài khoản có email: ${invite.email}`, 
        400
      );
    }

    if (classroom.isStudent(userId) || classroom.isTeacher(userId)) {
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

    await classroom.addStudent(userId);
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
    return response.sendError(res, 'Internal server error', 500);
  }
};

export default {
  joinClassroom,
  leaveClassroom,
  addStudent,
  removeStudent,
  getStudents,
  inviteStudentsByEmail,
  uploadStudentsExcel,
  createStudentAccounts,
  verifyInviteToken,
  checkEmailRegistered,
  joinClassroomByToken
};