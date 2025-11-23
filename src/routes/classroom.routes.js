import express from 'express';
import multer from 'multer';
import {
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
  getSubmissions,
  getStudentSubmissions,
  getProblemSubmissions,
  getLeaderboard,
  getStats
} from '../controllers/classroom.controller.js';
import { 
  authenticateToken, 
  verifyAdminOrTeacher
} from '../middlewares/auth.middleware.js';
import {
  verifyClassroomAccess,
  verifyClassroomTeacher,
  verifyClassroomOwner,
  loadClassroom,
  checkClassroomActive
} from '../middlewares/classroom.middleware.js';

const router = express.Router();

// Configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedMimes.includes(file.mimetype) || 
        file.originalname.endsWith('.xlsx') || 
        file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file Excel (.xlsx, .xls)'), false);
    }
  }
});

// ===== PUBLIC ROUTES (TRƯỚC authenticateToken) =====
router.post('/check-email', checkEmailRegistered);
router.get('/:classCode/verify-invite/:token', verifyInviteToken);

// ===== AUTHENTICATED ROUTES =====
router.use(authenticateToken);

// ===== SPECIFIC ROUTES (TRƯỚC DYNAMIC ROUTES) =====
// Join classroom routes
router.post('/join', joinClassroom);
router.post('/:classCode/join-by-token', joinClassroomByToken);

// ===== NEW: ALL classCode-based routes (PHẢI ĐẶT TRƯỚC /:id) =====
router.get('/class/:classCode', verifyClassroomAccess, getClassroomByClassCode);
router.put('/class/:classCode', verifyClassroomOwner, updateClassroom);
router.delete('/class/:classCode', verifyClassroomOwner, deleteClassroom);
router.post('/class/:classCode/regenerate-invite', verifyClassroomOwner, regenerateInviteCode);
router.post('/class/:classCode/leave', loadClassroom, leaveClassroom);

// Problems routes with classCode
router.get('/class/:classCode/problems', verifyClassroomAccess, getClassroomProblems);
router.post('/class/:classCode/problems', verifyClassroomTeacher, checkClassroomActive, addProblemToClassroom);
router.delete('/class/:classCode/problems/:problemShortId', verifyClassroomTeacher, checkClassroomActive, removeProblemFromClassroom);

// Students routes with classCode
router.get('/class/:classCode/students', verifyClassroomAccess, getStudents);
router.post('/class/:classCode/students', verifyClassroomTeacher, checkClassroomActive, addStudent);
router.delete('/class/:classCode/students/:studentId', verifyClassroomTeacher, checkClassroomActive, removeStudent);

// Upload Excel & Email with classCode
router.post('/class/:classCode/upload-students-excel', verifyClassroomTeacher, checkClassroomActive, upload.single('file'), uploadStudentsExcel);
router.post('/class/:classCode/invite-by-email', verifyClassroomTeacher, checkClassroomActive, inviteStudentsByEmail);
router.post('/class/:classCode/create-accounts', verifyClassroomTeacher, checkClassroomActive, createStudentAccounts);

// Submissions & Stats with classCode
router.get('/class/:classCode/submissions', verifyClassroomAccess, getSubmissions);
router.get('/class/:classCode/students/:studentId/submissions', verifyClassroomAccess, getStudentSubmissions);
router.get('/class/:classCode/problems/:problemShortId/submissions', verifyClassroomAccess, getProblemSubmissions);
router.get('/class/:classCode/leaderboard', verifyClassroomAccess, getLeaderboard);
router.get('/class/:classCode/stats', verifyClassroomAccess, getStats);

// ===== TEACHER/ADMIN ROUTES =====
router.post('/', verifyAdminOrTeacher, createClassroom);

// ===== OLD ROUTES WITH :id (FOR BACKWARD COMPATIBILITY) =====
router.put('/:id', verifyClassroomOwner, updateClassroom);
router.delete('/:id', verifyClassroomOwner, deleteClassroom);
router.post('/:id/regenerate-invite', verifyClassroomOwner, regenerateInviteCode);
router.post('/:id/leave', loadClassroom, leaveClassroom);

// Teacher routes - Problems
router.post('/:id/problems', verifyClassroomTeacher, checkClassroomActive, addProblemToClassroom);
router.delete('/:id/problems/:problemShortId', verifyClassroomTeacher, checkClassroomActive, removeProblemFromClassroom);

// Teacher routes - Students
router.post('/:id/students', verifyClassroomTeacher, checkClassroomActive, addStudent);
router.delete('/:id/students/:studentId', verifyClassroomTeacher, checkClassroomActive, removeStudent);

// Upload Excel & Email Actions
router.post('/:id/upload-students-excel', verifyClassroomTeacher, checkClassroomActive, upload.single('file'), uploadStudentsExcel);
router.post('/:id/invite-by-email', verifyClassroomTeacher, checkClassroomActive, inviteStudentsByEmail);
router.post('/:id/create-accounts', verifyClassroomTeacher, checkClassroomActive, createStudentAccounts);

// Common routes
router.get('/:id/problems', verifyClassroomAccess, getClassroomProblems);
router.get('/:id/students', verifyClassroomAccess, getStudents);

// Get all classrooms
router.get('/', getClassrooms);

// Get classroom by ID - ĐẶT CUỐI CÙNG vì :id catch-all
router.get('/:id', verifyClassroomAccess, getClassroomById);

export default router;