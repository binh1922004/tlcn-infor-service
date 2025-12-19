import express from 'express'
import {authenticateToken, optionalAuth, verifyAdmin} from "../middlewares/auth.middleware.js";
import {getSubmission, getSubmissionStatistics, getAllSubmissionStatusStatistics} from "../controllers/submission.controller.js";

const router = express.Router()
router.get('', authenticateToken, verifyAdmin, getSubmission);
router.get('/stats', authenticateToken, verifyAdmin, getSubmissionStatistics);
router.get('/admin/statistics/all-status', authenticateToken, verifyAdmin, getAllSubmissionStatusStatistics);
export default router;