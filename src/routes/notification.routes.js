import express from 'express';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import {
    getNotifications,
    markAsRead,
    markAllAsRead,
    getUnreadCount,
    deleteNotification,
    deleteAllRead
} from '../controllers/notification.controller.js';

const router = express.Router();

router.use(authenticateToken);

// GET /api/notifications - Lấy danh sách thông báo
router.get('/', getNotifications);

// GET /api/notifications/unread-count - Đếm số thông báo chưa đọc
router.get('/unread-count', getUnreadCount);

// PUT /api/notifications/:id/read - Đánh dấu 1 thông báo đã đọc
router.put('/:id/read', markAsRead);

// PUT /api/notifications/read-all - Đánh dấu tất cả đã đọc
router.put('/read-all', markAllAsRead);

// DELETE /api/notifications/:id - Xóa 1 thông báo
router.delete('/:id', deleteNotification);

// DELETE /api/notifications/read - Xóa tất cả thông báo đã đọc
router.delete('/read', deleteAllRead);

export default router;