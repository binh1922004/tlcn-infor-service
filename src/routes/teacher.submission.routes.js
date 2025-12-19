import express from 'express';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { verifyClassroomTeacher } from '../middlewares/classroom.middleware.js';
import { 
  getSubmissionsByClassroom,
  getClassroomSubmissionStatistics
} from '../controllers/submission.controller.js';

const router = express.Router();

router.get(
  '/classroom/:id',
  authenticateToken,
  verifyClassroomTeacher,
  getSubmissionsByClassroom
);

router.get(
  '/classroom/:id/statistics',
  authenticateToken,
  verifyClassroomTeacher,
  getClassroomSubmissionStatistics
);

export default router;