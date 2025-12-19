import response from "../../helpers/response.js";
import contestModel from "../../models/contest.model.js";
import contestParticipantModel from "../../models/contestParticipant.model.js";
import bcrypt from 'bcryptjs';

const randomString = (length = 6) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Tạo kỳ thi cho lớp học
 * Route: POST /api/classroom/class/:classCode/exams
 */
export const createExamForClassroom = async (req, res) => {
  try {
    const classroom = req.classroom;
    const userId = req.user._id;
    const {
      title,
      description,
      startTime,
      endTime,
      duration,
      problems, 
      isPrivate,
      password
    } = req.body;

    if (!title || !startTime || !endTime) {
      return response.sendError(res, 'Thiếu thông tin bắt buộc', 400);
    }

    const now = new Date();
    if (new Date(startTime) < now) {
      return response.sendError(res, 'Thời gian bắt đầu phải trong tương lai', 400);
    }

    if (new Date(endTime) <= new Date(startTime)) {
      return response.sendError(res, 'Thời gian kết thúc phải sau thời gian bắt đầu', 400);
    }

    const code = `${classroom.classCode}-${randomString(4)}`.toUpperCase();

    const contest = new contestModel({
      createdBy: userId,
      title,
      description,
      startTime,
      endTime,
      duration: duration || (new Date(endTime).getTime() - new Date(startTime).getTime()),
      problems: problems || [],
      code,
      isPrivate: isPrivate !== undefined ? isPrivate : true,
      password: isPrivate && password ? bcrypt.hashSync(password, 10) : null,
      isActive: true,
      classRoom: classroom._id
    });

    await contest.save();

    const activeStudents = classroom.students.filter(s => s.status === 'active');
    
    const participants = activeStudents.map(student => ({
      contestId: contest._id,
      userId: student.userId,
      joinedAt: new Date(),
      mode: 'official',
      startTime: contest.startTime,
      endTime: contest.endTime
    }));

    if (participants.length > 0) {
      await contestParticipantModel.insertMany(participants);
    }

    return response.sendSuccess(res, {
      contest,
      totalParticipants: participants.length
    }, 'Tạo kỳ thi thành công');

  } catch (error) {
    console.error('❌ Error creating exam for classroom:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Lấy danh sách kỳ thi của lớp học
 * Route: GET /api/classroom/class/:classCode/exams
 */
export const getClassroomExams = async (req, res) => {
  try {
    const classroom = req.classroom;
    const { status, page = 1, size = 20 } = req.query;

    const pageNumber = parseInt(page);
    const pageSize = parseInt(size);
    const skip = (pageNumber - 1) * pageSize;

    let filter = { classRoom: classroom._id };

    const now = new Date();
    if (status === 'upcoming') {
      filter.startTime = { $gt: now };
    } else if (status === 'ongoing') {
      filter.startTime = { $lte: now };
      filter.endTime = { $gte: now };
    } else if (status === 'ended') {
      filter.endTime = { $lt: now };
    }

    const total = await contestModel.countDocuments(filter);
    
    const exams = await contestModel
      .find(filter)
      .populate('problems.problemId', 'name difficulty shortId')
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(pageSize);

    const userId = req.user._id;
    const examsWithRegistration = await Promise.all(
      exams.map(async (exam) => {
        const isRegistered = await contestParticipantModel.exists({
          contestId: exam._id,
          userId
        });
        
        return {
          ...exam.toObject(),
          isRegistered: !!isRegistered
        };
      })
    );

    return response.sendSuccess(res, {
      exams: examsWithRegistration,
      pagination: {
        total,
        page: pageNumber,
        size: pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    });

  } catch (error) {
    console.error('❌ Error getting classroom exams:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Xóa kỳ thi khỏi lớp học
 * Route: DELETE /api/classroom/class/:classCode/exams/:contestId
 */
export const deleteExamFromClassroom = async (req, res) => {
  try {
    const { contestId } = req.params;
    const classroom = req.classroom;

    const contest = await contestModel.findOne({
      _id: contestId,
      classRoom: classroom._id
    });

    if (!contest) {
      return response.sendError(res, 'Không tìm thấy kỳ thi', 404);
    }

    contest.isActive = false;
    await contest.save();

    return response.sendSuccess(res, null, 'Xóa kỳ thi thành công');

  } catch (error) {
    console.error('❌ Error deleting exam:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

export default {
  createExamForClassroom,
  getClassroomExams,
  deleteExamFromClassroom
};