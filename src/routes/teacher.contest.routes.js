import express from 'express';
import { authenticateToken, verifyAdminOrTeacher } from "../middlewares/auth.middleware.js";
import {
    addProblemsToContest,
    create,
    deleteContest,
    getAll,
    getContestById,
    getContestStatistics,
    toggleContestStatus,
    updateContest
} from "../controllers/contest.controller.js";

const router = express.Router();

router.post('/', authenticateToken, verifyAdminOrTeacher, create);
router.post('/:contestId/problems', authenticateToken, verifyAdminOrTeacher, addProblemsToContest);
router.get('/', authenticateToken, verifyAdminOrTeacher, getAll);
router.get('/:id', authenticateToken, verifyAdminOrTeacher, getContestById);
router.put("/:id", authenticateToken, verifyAdminOrTeacher, updateContest);
router.delete("/:id", authenticateToken, verifyAdminOrTeacher, deleteContest);
router.patch("/:id/toggle", authenticateToken, verifyAdminOrTeacher, toggleContestStatus);
router.get('/stats', authenticateToken, verifyAdminOrTeacher, getContestStatistics);

export default router;