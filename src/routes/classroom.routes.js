import express from 'express';
import multer from 'multer';
import {
  createClassroom,
  getClassrooms,
  getClassroomById,
  getClassroomByClassCode,
  updateClassroom,
  deleteClassroom,
  regenerateInviteCode
} from '../controllers/classroom/classroom.controller.js';

import {
  joinClassroom,
  leaveClassroom,
  addStudent,
  removeStudent,
  getStudents,
  uploadStudentsExcel,
  inviteStudentsByEmail,
  createStudentAccounts,
  verifyInviteToken,
  checkEmailRegistered,
  joinClassroomByToken
} from '../controllers/classroom/classroom.member.controller.js';

import {
  addProblemToClassroom,
  updateProblemInClassroom,
  removeProblemFromClassroom,
  getClassroomProblems,
  getClassroomProblemsWithProgress,
  getSubmissions,
  getProblemSubmissions
} from '../controllers/classroom/classroom.assignment.controller.js';

import {
  getStudentProgress,
  getStudentSubmissions,
  getSubmissionDetail,
  getGradeBook,
  exportGradeBook,
  getLeaderboard
} from '../controllers/classroom/classroom.grade.controller.js';

import {
  createExamForClassroom,
  getClassroomExams,
  deleteExamFromClassroom
} from '../controllers/classroom/classroom.contest.controller.js';

import {
  getStats,
  getRecentActivities
} from '../controllers/classroom/classroom.stats.controller.js';
import {
  createDiscussion,
  getDiscussions,
  getDiscussionById,
  updateDiscussion,
  deleteDiscussion,
  addComment,
  editComment,
  deleteComment,
  toggleCommentLike,
  addReaction,
  removeReaction,
  togglePin,
  toggleLock,
  archiveDiscussion,
  addReply,
  editReply,
  deleteReply,
  toggleReplyLike
} from '../controllers/classroom/classroom.discussion.controller.js';
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

router.post('/check-email', checkEmailRegistered);
router.get('/:classCode/verify-invite/:token', verifyInviteToken);

// ===== AUTHENTICATED ROUTES =====
router.use(authenticateToken);

// Join classroom routes
router.post('/join', joinClassroom);
router.post('/:classCode/join-by-token', joinClassroomByToken);

router.get('/class/:classCode', verifyClassroomAccess, getClassroomByClassCode);
router.put('/class/:classCode', verifyClassroomOwner, updateClassroom);
router.delete('/class/:classCode', verifyClassroomOwner, deleteClassroom);
router.post('/class/:classCode/regenerate-invite', verifyClassroomOwner, regenerateInviteCode);
router.post('/class/:classCode/leave', loadClassroom, leaveClassroom);
// Exam routes with classCode
router.post('/class/:classCode/exams', 
  verifyClassroomTeacher, 
  checkClassroomActive, 
  createExamForClassroom
);
router.get('/class/:classCode/exams', 
  verifyClassroomAccess, 
  getClassroomExams
);
router.delete('/class/:classCode/exams/:contestId', 
  verifyClassroomTeacher, 
  checkClassroomActive, 
  deleteExamFromClassroom
);

// Problems routes with classCode
router.get('/class/:classCode/problems', verifyClassroomAccess, getClassroomProblems);
router.post('/class/:classCode/problems', verifyClassroomTeacher, checkClassroomActive, addProblemToClassroom);
router.patch('/class/:classCode/problems/:problemShortId',
verifyClassroomTeacher,
  checkClassroomActive,
  updateProblemInClassroom
);
router.delete('/class/:classCode/problems/:problemShortId', 
  verifyClassroomTeacher, 
  checkClassroomActive, 
  removeProblemFromClassroom);

router.get('/class/:classCode/problems/with-progress', 
  authenticateToken, 
  verifyClassroomAccess, 
  getClassroomProblemsWithProgress
);



// Students routes with classCode
router.get('/class/:classCode/students', verifyClassroomAccess, getStudents);
router.post('/class/:classCode/students', verifyClassroomTeacher, checkClassroomActive, addStudent);
router.delete('/class/:classCode/students/:studentId', verifyClassroomTeacher, checkClassroomActive, removeStudent);
router.get('/class/:classCode/students/:studentId/progress', 
  verifyClassroomTeacher, 
  getStudentProgress
);

router.get('/class/:classCode/students/:studentId/submissions', 
  verifyClassroomTeacher, 
  getStudentSubmissions
);
router.get(
  '/class/:classCode/students/:studentId/submissions/:submissionId',
  verifyClassroomTeacher,
  getSubmissionDetail
);

// Upload Excel & Email with classCode
router.post('/class/:classCode/upload-students-excel', verifyClassroomTeacher, checkClassroomActive, upload.single('file'), uploadStudentsExcel);
router.post('/class/:classCode/invite-by-email', verifyClassroomTeacher, checkClassroomActive, inviteStudentsByEmail);
router.post('/class/:classCode/create-accounts', verifyClassroomTeacher, checkClassroomActive, createStudentAccounts);

// Submissions & Stats with classCode
router.get('/class/:classCode/submissions', verifyClassroomAccess, getSubmissions);
router.get('/class/:classCode/students/:studentId/submissions', verifyClassroomAccess, getStudentSubmissions);
router.get('/class/:classCode/problems/:problemShortId/submissions', verifyClassroomAccess, getProblemSubmissions);
router.get('/:classCode/leaderboard', verifyClassroomAccess, getLeaderboard);
router.get('/:classCode/gradebook', 
  authenticateToken, 
  verifyClassroomTeacher, 
  getGradeBook
);

router.get('/:classCode/gradebook/export', 
  authenticateToken, 
  verifyClassroomTeacher, 
  exportGradeBook
);
router.get('/class/:classCode/stats', verifyClassroomAccess, getStats);
router.get('/class/:classCode/activities', verifyClassroomAccess, getRecentActivities);

router.get('/class/:classCode/discussions', 
  verifyClassroomAccess, 
  getDiscussions
);

router.post('/class/:classCode/discussions', 
  verifyClassroomAccess,
  checkClassroomActive,
  createDiscussion
);

router.get('/class/:classCode/discussions/:discussionId', 
  verifyClassroomAccess, 
  getDiscussionById
);

router.put('/class/:classCode/discussions/:discussionId', 
  verifyClassroomAccess,
  checkClassroomActive,
  updateDiscussion
);

router.delete('/class/:classCode/discussions/:discussionId', 
  verifyClassroomAccess,
  checkClassroomActive,
  deleteDiscussion
);

// Comments
router.post('/class/:classCode/discussions/:discussionId/comments', 
  verifyClassroomAccess,
  checkClassroomActive,
  addComment
);

router.put('/class/:classCode/discussions/:discussionId/comments/:commentId',
  verifyClassroomAccess,
  checkClassroomActive,
  editComment
);

router.delete('/class/:classCode/discussions/:discussionId/comments/:commentId',
  verifyClassroomAccess,
  checkClassroomActive,
  deleteComment
);

router.post('/class/:classCode/discussions/:discussionId/comments/:commentId/like',
  verifyClassroomAccess,
  toggleCommentLike
);
//Reply
router.post('/class/:classCode/discussions/:discussionId/comments/:commentId/replies', 
  verifyClassroomAccess,
  checkClassroomActive,
  addReply
);

router.put('/class/:classCode/discussions/:discussionId/comments/:commentId/replies/:replyId',
  verifyClassroomAccess,
  checkClassroomActive,
  editReply
);

router.delete('/class/:classCode/discussions/:discussionId/comments/:commentId/replies/:replyId',
  verifyClassroomAccess,
  checkClassroomActive,
  deleteReply
);

router.post('/class/:classCode/discussions/:discussionId/comments/:commentId/replies/:replyId/like',
  verifyClassroomAccess,
  toggleReplyLike
);


// Reactions
router.post('/class/:classCode/discussions/:discussionId/react',
  verifyClassroomAccess,
  addReaction
);

router.delete('/class/:classCode/discussions/:discussionId/react',
  verifyClassroomAccess,
  removeReaction
);

// Pin/Lock (Teacher only)
router.post('/class/:classCode/discussions/:discussionId/pin',
  verifyClassroomTeacher,
  togglePin
);

router.post('/class/:classCode/discussions/:discussionId/lock',
  verifyClassroomTeacher,
  toggleLock
);

router.post('/class/:classCode/discussions/:discussionId/archive',
  verifyClassroomTeacher,
  archiveDiscussion
);

// TEACHER/ADMIN ROUTES 
router.post('/', verifyAdminOrTeacher, createClassroom);

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