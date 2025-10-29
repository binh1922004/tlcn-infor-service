import express from 'express';
import {
  createClassroom,
  getClassrooms,
  getClassroomById,
  joinClassroom,
  leaveClassroom,
  addProblemToClassroom,
  removeProblemFromClassroom,
  updateClassroom,
  deleteClassroom
} from '../controllers/classroom.controller.js';
import { authenticateToken, verifyAdminOrTeacher } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Routes cần authentication
router.use(authenticateToken);

// CRUD lớp học - Chỉ admin/teacher
router.post('/', verifyAdminOrTeacher, createClassroom);                    // Tạo lớp
router.get('/', getClassrooms);                                             // Lấy danh sách lớp (all users)
router.get('/:id', getClassroomById);                                       // Chi tiết lớp (check quyền trong controller)
router.put('/:id', updateClassroom);                                        // Cập nhật lớp (check owner trong controller)
router.delete('/:id', deleteClassroom);                                     // Xóa lớp (check owner trong controller)

// Tham gia/rời lớp - Tất cả users
router.post('/join', joinClassroom);                                        // Join bằng mã
router.post('/:id/leave', leaveClassroom);                                  // Rời lớp

// Quản lý bài tập - Check trong controller
router.post('/:id/problems', verifyAdminOrTeacher, addProblemToClassroom);                        // Thêm bài tập
router.delete('/:id/problems/:problemShortId',verifyAdminOrTeacher, removeProblemFromClassroom); // Xóa bài tập

export default router;