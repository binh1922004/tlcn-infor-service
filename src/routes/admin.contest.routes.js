import express from 'express';
import {authenticateToken, verifyAdmin} from "../middlewares/auth.middleware.js";
import {
    addProblemsToContest,
    create,
    deleteContest,
    getAll,
    getAllPublicContests, toggleContestStatus,
    updateContest
} from "../controllers/contest.controller.js";
const router = express.Router()

router.post('/', authenticateToken, verifyAdmin, create);
router.post('/:contestId/problem/:problemId', authenticateToken, verifyAdmin, addProblemsToContest);
router.get('/', authenticateToken, verifyAdmin, getAll);
router.put("/:id", authenticateToken, verifyAdmin, updateContest);
router.delete("/:id", authenticateToken, verifyAdmin, deleteContest);
router.patch("/:id/toggle", authenticateToken, verifyAdmin, toggleContestStatus);
export default router