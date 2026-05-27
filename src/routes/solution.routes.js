import express from 'express';
import solutionController from '../controllers/solution.controller.js';
import { authenticateToken, optionalAuth } from '../middlewares/auth.middleware.js';
import { verifyAdminOrTeacher, verifyAdmin } from '../middlewares/auth.middleware.js';
import * as commentController from '../controllers/comment.controller.js';

const router = express.Router();

router.get('/problem/:problemShortId', optionalAuth, solutionController.getProblemSolutions);

router.get('/check/:problemShortId', authenticateToken, verifyAdmin, solutionController.checkSolutionExists);
router.get('/votes/status', authenticateToken, solutionController.getUserVoteStatus);
router.get('/admin/all', authenticateToken, verifyAdmin, solutionController.getAllSolutions);

// Get solution by ID (with optional auth)
router.get('/:id', optionalAuth, solutionController.getSolutionById);

// Get comments for solution (with optional auth)
//router.get('/:id/comments', optionalAuth, solutionController.getSolutionComments);
router.get('/:id/comments', optionalAuth, commentController.getPostComments);
// Protected routes
router.post('/', authenticateToken, solutionController.createSolution);
router.put('/:id', authenticateToken, solutionController.updateSolution);
router.delete('/:id', authenticateToken, solutionController.deleteSolution);
router.put('/:id/resubmit', authenticateToken, solutionController.resubmitSolution);
// Vote routes
router.post('/:id/vote', authenticateToken, solutionController.voteSolution);
router.delete('/:id/vote', authenticateToken, solutionController.removeVote);

router.post('/:id/comments', authenticateToken, commentController.createComment);
router.put('/:id/comments/:commentId', authenticateToken, commentController.updateComment);
router.delete('/:id/comments/:commentId', authenticateToken, commentController.deleteComment);
router.post('/:id/comments/:commentId/vote', authenticateToken, commentController.voteComment);
// Moderate
router.patch('/:id/moderate', authenticateToken, verifyAdminOrTeacher, solutionController.moderateSolution);

export default router;