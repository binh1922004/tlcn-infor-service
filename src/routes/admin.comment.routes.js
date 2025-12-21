import { Router } from 'express';
import {
  getAdminComments,
  getCommentStats,
  getRecentComments,
  toggleHideComment,
  deleteComment as adminDeleteComment,
  getCommentDetail
} from '../controllers/admin.comment.controller.js';
import { authenticateToken, verifyAdmin } from '../middlewares/auth.middleware.js';

const router = Router();

// ============================================
// ADMIN COMMENT ROUTES
// Tất cả routes đã có prefix /api/admin/comments từ app.js
// ============================================

// GET /api/admin/comments/stats
router.get(
  '/stats',
  authenticateToken,
  verifyAdmin,
  getCommentStats
);

// GET /api/admin/comments/recent
router.get(
  '/recent',
  authenticateToken,
  verifyAdmin,
  getRecentComments
);

// GET /api/admin/comments/:commentId
router.get(
  '/:commentId',
  authenticateToken,
  verifyAdmin,
  getCommentDetail
);

// GET /api/admin/comments (list with filters)
router.get(
  '/',
  authenticateToken,
  verifyAdmin,
  getAdminComments
);

// PATCH /api/admin/comments/:commentId/toggle-hide
router.patch(
  '/:commentId/toggle-hide',
  authenticateToken,
  verifyAdmin,
  toggleHideComment
);

// DELETE /api/admin/comments/:commentId
router.delete(
  '/:commentId',
  authenticateToken,
  verifyAdmin,
  adminDeleteComment
);

export default router;