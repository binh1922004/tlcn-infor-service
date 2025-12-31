import express from 'express';
import {authenticateToken, verifyAdmin} from "../middlewares/auth.middleware.js";
import {
    addProblemsToContest,
    create,
    deleteContest, disqualifyParticipant,
    getAll,
    getContestStatistics, getParticipants, toggleContestStatus,
    updateContest
} from "../controllers/contest.controller.js";
const router = express.Router()

router.post('/', authenticateToken, verifyAdmin, create);
router.post('/:contestId/problems', authenticateToken, verifyAdmin, addProblemsToContest);
router.get('/', authenticateToken, verifyAdmin, getAll);
router.put("/:id", authenticateToken, verifyAdmin, updateContest);
router.delete("/:id", authenticateToken, verifyAdmin, deleteContest);
router.patch("/:id/toggle", authenticateToken, verifyAdmin, toggleContestStatus);
router.get('/stats', authenticateToken, verifyAdmin, getContestStatistics);
router.get('/:id/participants', authenticateToken, verifyAdmin, getParticipants);
router.patch('/:id/toggle/:participantId', authenticateToken, verifyAdmin, disqualifyParticipant);
export default router