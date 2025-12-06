import express from 'express'
import {
    getSubmission,
    getSubmissionById, getSubmissionDifficultyChart,
    getSubmissionsByUserId, getSubmissionStatusChartByUser, getUserSubmissionCalendar,
    submitProblem
} from "../controllers/submission.controller.js";
import {authenticateToken, optionalAuth} from "../middlewares/auth.middleware.js";
const router = express.Router()

router.post('/:id', authenticateToken, submitProblem)
// router.get('/', getSubmission)
router.get('/:id', optionalAuth, getSubmissionById)
router.get('/user/:id', optionalAuth, getSubmissionsByUserId)
router.get('/user/:id/calendar', getUserSubmissionCalendar)
router.get('/user/:id/status-chart', getSubmissionStatusChartByUser)
router.get('/user/:id/difficulty-chart', getSubmissionDifficultyChart)
export default router