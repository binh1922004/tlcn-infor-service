import { Router } from 'express';
import {
  createComment,
  getPostComments,
  updateComment,
  deleteComment,
  toggleLikeComment,
  getCommentReplies,
  getCommentById
} from '../controllers/comment.controller.js';
import {authenticateToken, optionalAuth} from '../middlewares/auth.middleware.js'
const router = Router();
// Public routes
router.get('/post/:postId',optionalAuth, getPostComments);
router.get('/:commentId', optionalAuth,getCommentById);
router.get('/:commentId/replies', optionalAuth,getCommentReplies);

// Protected routes
router.post('/', authenticateToken, createComment);
router.put('/:commentId', authenticateToken, updateComment);
router.delete('/:commentId', authenticateToken, deleteComment);
router.post('/:commentId/like', authenticateToken, toggleLikeComment);

export default router;