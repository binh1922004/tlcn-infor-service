import express from 'express';
import * as postCtrl from '../controllers/post.controller.js';
import { sanitizeRequestHtml, loadPost, ensureAuthor } from '../middlewares/post.middleware.js';
import { authenticateToken } from '../middlewares/auth.middleware.js'; // implement auth middleware

const router = express.Router();

router.get('/', postCtrl.getPosts);
router.get('/popular', postCtrl.getPopularPosts);
router.get('/recent', postCtrl.getRecentPosts);
router.get('/:id', loadPost, postCtrl.getPost);

router.post('/', authenticateToken, sanitizeRequestHtml, postCtrl.createPost);
router.put('/:id', authenticateToken, loadPost, ensureAuthor, sanitizeRequestHtml, postCtrl.updatePost);
router.delete('/:id', authenticateToken, loadPost, ensureAuthor, postCtrl.deletePost);

router.post('/:id/like', authenticateToken, postCtrl.addLike);
router.post('/:id/unlike', authenticateToken, postCtrl.removeLike);
router.post('/:id/share', authenticateToken, postCtrl.addShare);
//router.post('/:id/view', authenticateToken.incrementViews);

export default router;