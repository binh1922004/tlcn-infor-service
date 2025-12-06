import express from 'express';
import solutionController from '../controllers/solution.controller.js';
import { authenticateToken, optionalAuth } from '../middlewares/auth.middleware.js';
import { verifyAdminOrTeacher, verifyAdmin } from '../middlewares/auth.middleware.js';

const router = express.Router();

// ===== PUBLIC ROUTES (with optional auth) =====
router.get('/problem/:problemShortId', optionalAuth, solutionController.getProblemSolutions);

// ===== AUTHENTICATED ROUTES =====
// Must be BEFORE /:id routes
router.get('/check/:problemShortId', authenticateToken, verifyAdmin, solutionController.checkSolutionExists);
router.get('/votes/status', authenticateToken, solutionController.getUserVoteStatus);
router.get('/admin/all', authenticateToken, verifyAdmin, solutionController.getAllSolutions);

// Get solution by ID (with optional auth)
router.get('/:id', optionalAuth, solutionController.getSolutionById);

// Get comments for solution (with optional auth)
router.get('/:id/comments', optionalAuth, solutionController.getSolutionComments);

// Protected routes
router.post('/', authenticateToken, solutionController.createSolution);
router.put('/:id', authenticateToken, solutionController.updateSolution);
router.delete('/:id', authenticateToken, solutionController.deleteSolution);

// Vote routes
router.post('/:id/vote', authenticateToken, solutionController.voteSolution);
router.delete('/:id/vote', authenticateToken, solutionController.removeVote);

// Comment routes
router.post('/:id/comments', authenticateToken, solutionController.addComment);
router.put('/:id/comments/:commentId', authenticateToken, solutionController.updateComment);
router.delete('/:id/comments/:commentId', authenticateToken, solutionController.deleteComment);
router.post('/:id/comments/:commentId/vote', authenticateToken, solutionController.voteComment);
router.post('/:id/comments/:commentId/replies', authenticateToken, solutionController.addReply);

// Moderate
router.patch('/:id/moderate', authenticateToken, verifyAdminOrTeacher, solutionController.moderateSolution);

export default router;