import { Router } from "express";
import {
  getLeaderboard,
  getUserRating,
  getUserRatingHistory,
  calculateContestRating,
} from "../controllers/ranking.controller.js";
import {
  authenticateToken,
  optionalAuth,
} from "../middlewares/auth.middleware.js";

const router = Router();

/**
 * GET /api/rankings
 * Bảng xếp hạng toàn hệ thống (public, không cần đăng nhập)
 * Query: page, limit, search, rankFilter
 */
router.get("/", optionalAuth, getLeaderboard);

/**
 * GET /api/rankings/users/:userId/rating
 * Lấy thông tin Elo hiện tại của 1 user (public)
 */
router.get("/users/:userId/rating", optionalAuth, getUserRating);

/**
 * GET /api/rankings/users/:userId/rating-history
 * Lịch sử thay đổi Elo của user (public)
 * Query: page, limit
 */
router.get("/users/:userId/rating-history", optionalAuth, getUserRatingHistory);

/**
 * POST /api/rankings/contests/:contestId/calculate-rating
 * Tự động tính Elo sau khi contest kết thúc.
 * Chỉ cần đăng nhập — không yêu cầu quyền admin/teacher.
 */
router.post(
  "/contests/:contestId/calculate-rating",
  authenticateToken,
  calculateContestRating
);

export default router;
