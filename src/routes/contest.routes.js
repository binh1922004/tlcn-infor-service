import express from 'express';
import {authenticateToken, optionalAuth} from "../middlewares/auth.middleware.js";
import {
    codeChecking,
    getAllPublicContests,
    getContestByCode,
    getContestById, registerToContest
} from "../controllers/contest.controller.js";
const router = express.Router()

router.get('/', optionalAuth, getAllPublicContests);
router.post('/code/check', codeChecking);
router.get('/:id', optionalAuth, getContestById)
router.get('/code/:code', optionalAuth, getContestByCode)
router.post('/:id/register', authenticateToken, registerToContest);
export default router