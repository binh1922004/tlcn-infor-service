import express from 'express';
import solutionController from '../controllers/solution.controller.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { verifyAdminOrTeacher, verifyAdmin } from '../middlewares/auth.middleware.js';

const router = express.Router();

// ===== PUBLIC ROUTES =====
// Get solutions for a problem (public can view published solutions)
router.get('/problem/:problemShortId', solutionController.getProblemSolutions);

// Get solution by ID (public can view published solutions)
router.get('/:id', solutionController.getSolutionById);

router.use(authenticateToken);

// Create solution (authenticated users, but admins auto-publish)
router.post('/', solutionController.createSolution);

// Update own solution
router.put('/:id', solutionController.updateSolution);

// Delete own solution
router.delete('/:id', solutionController.deleteSolution);

// Vote solution
router.post('/:id/vote', solutionController.voteSolution);

// Comments
router.post('/:id/comments', solutionController.addComment);
router.put('/:id/comments/:commentId', solutionController.updateComment);
router.delete('/:id/comments/:commentId', solutionController.deleteComment);
router.post('/:id/comments/:commentId/vote', solutionController.voteComment);
router.post('/:id/comments/:commentId/replies', solutionController.addReply);

// ===== ADMIN ONLY =====
//router.post('/:id/moderate', verifyAdminOrTeacher, solutionController.moderateSolution);
router.get('/admin/all', verifyAdmin, solutionController.getAllSolutions);
export default router;