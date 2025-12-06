import express from 'express'
import {authenticateToken, optionalAuth, verifyAdmin} from "../middlewares/auth.middleware.js";
import {getSubmission, getSubmissionStatistics} from "../controllers/submission.controller.js";

const router = express.Router()
router.get('', authenticateToken, verifyAdmin, getSubmission);
router.get('/stats', authenticateToken, verifyAdmin, getSubmissionStatistics);
export default router;