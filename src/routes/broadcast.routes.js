import express from 'express';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import {
    getBroadcasts,
    markBroadcastAsSeen,
    dismissBroadcast,
    getUnseenBroadcastsCount
} from '../controllers/notification.controller.js';

const router = express.Router();

router.use(authenticateToken);

// GET /api/broadcasts - Lấy danh sách broadcasts
router.get('/', getBroadcasts);

// GET /api/broadcasts/unseen-count - Đếm số broadcasts chưa xem
router.get('/unseen-count', getUnseenBroadcastsCount);

// POST /api/broadcasts/:broadcastId/seen - Đánh dấu broadcast đã xem
router.post('/:broadcastId/seen', markBroadcastAsSeen);

// POST /api/broadcasts/:broadcastId/dismiss - Dismiss broadcast
router.post('/:broadcastId/dismiss', dismissBroadcast);

export default router;