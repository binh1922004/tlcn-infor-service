import express from "express";
import { runPreTest, getPreTestStatus } from "../controllers/preTest.controller.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

/**
 * POST /api/pretest
 * Run user code against a single custom input/expected-output pair before submitting.
 */
router.post("", authenticateToken, runPreTest);

/**
 * GET /api/pretest/:id
 * Retrieve cached pre-test status from Redis.
 */
router.get("/:id", authenticateToken, getPreTestStatus);

export default router;
