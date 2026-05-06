import express from "express";
import {
  getUserSkillMastery,
  getUserSkillMasteryByUserId,
  getSkillHistory,
  getTagBKTProfiles,
  updateTagBKTProfile,
  seedTagProfilesHandler,
} from "../controllers/bkt.controller.js";
import {
  authenticateToken,
  verifyAdmin,
  optionalAuth,
} from "../middlewares/auth.middleware.js";

const router = express.Router();

// ─── User-facing routes ────────────────────────────────

// Lấy skill mastery của chính mình
router.get("/mastery", authenticateToken, getUserSkillMastery);

// Lấy skill mastery của user khác (public profile)
router.get("/mastery/:userId", optionalAuth, getUserSkillMasteryByUserId);

// Lấy lịch sử P(L) của 1 tag
router.get("/mastery/history/:tagName", authenticateToken, getSkillHistory);

// ─── Admin routes ──────────────────────────────────────

// Danh sách tag profiles
router.get("/tags", authenticateToken, verifyAdmin, getTagBKTProfiles);

// Cập nhật BKT params cho 1 tag
router.put("/tags/:tagName", authenticateToken, verifyAdmin, updateTagBKTProfile);

// Auto-seed tags
router.post("/tags/seed", authenticateToken, verifyAdmin, seedTagProfilesHandler);

export default router;
