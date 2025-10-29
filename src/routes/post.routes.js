import express from 'express';
import * as postCtrl from '../controllers/post.controller.js';
import { sanitizeRequestHtml, loadPost, ensureAuthor } from '../middlewares/post.middleware.js';
import { authenticateToken, optionalAuth, verifyAdmin  } from '../middlewares/auth.middleware.js'; 

const router = express.Router();

router.get('/all', optionalAuth ,postCtrl.getPosts);
router.get('/popular', postCtrl.getPopularPosts);
router.get('/recent', postCtrl.getRecentPosts);
router.get('/:id/details', loadPost, postCtrl.getPost);

router.post('/create', authenticateToken, sanitizeRequestHtml, postCtrl.createPost);
router.put('/:id/update', authenticateToken, loadPost, ensureAuthor, sanitizeRequestHtml, postCtrl.updatePost);
router.delete('/:id/delete', authenticateToken, loadPost, ensureAuthor, postCtrl.deletePost);

router.post('/:id/actions/toggle-like', authenticateToken, postCtrl.toggleLike);
router.post('/:id/actions/share', authenticateToken, postCtrl.addShare);

// Lấy danh sách bài viết (Admin) - có filter, search, pagination
router.get('/admin/posts', authenticateToken, verifyAdmin, postCtrl.getAdminPostsList);
router.get('/admin/posts/stats', authenticateToken, verifyAdmin, postCtrl.getAdminPostStats);
router.get('/admin/posts/:id', authenticateToken, verifyAdmin, postCtrl.getAdminPostDetail);
router.delete('/admin/posts/:id', authenticateToken, verifyAdmin, postCtrl.deleteAdminPost);
router.patch('/admin/posts/:id/status', authenticateToken, verifyAdmin, postCtrl.updateAdminPostStatus);
router.patch('/admin/posts/:id/pin', authenticateToken, verifyAdmin, postCtrl.togglePinPost);
router.post('/admin/posts/bulk/status', authenticateToken, verifyAdmin, postCtrl.bulkUpdatePostsStatus);
router.post('/admin/posts/bulk/delete', authenticateToken, verifyAdmin, postCtrl.bulkDeletePosts);
export default router;