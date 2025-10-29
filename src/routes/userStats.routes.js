import express from 'express';
import * as userStatsController from '../controllers/userStats.controller.js';
import { authenticateToken, verifyAdmin } from '../middlewares/auth.middleware.js';
const router = express.Router();
// Tất cả routes đều yêu cầu admin
router.use(authenticateToken);
router.use(verifyAdmin);
// Thống kê tổng quan
router.get('/overview', userStatsController.getAdminStats);
// Thống kê theo vai trò
router.get('/roles', userStatsController.getRoleStats);
// Người dùng mới nhất
router.get('/recent', userStatsController.getRecentUsers);
// Thống kê theo tháng
router.get('/monthly', userStatsController.getUsersByMonthStats);
// Thống kê theo ngày
router.get('/daily', userStatsController.getUsersByDayStats);
// Thống kê theo khoảng thời gian tùy chỉnh
router.get('/custom', userStatsController.getCustomPeriodStats);
export default router;