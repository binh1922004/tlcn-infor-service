import express from 'express'
import {getSubmission, getSubmissionsByUserId, submitProblem} from "../controllers/submission.controller.js";
import {authenticateToken} from "../middlewares/auth.middleware.js";
const router = express.Router()

router.post('/:id', authenticateToken, submitProblem)
router.get('/', getSubmission)
router.get('/user/:id', getSubmissionsByUserId)
export default router