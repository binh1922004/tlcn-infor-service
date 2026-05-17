import express from "express";
import {
    createTestCasePlan,
    regenerateTestCasePlan,
    getTestCasePlan,
    listTestCasePlans,
} from "../controllers/testCasePlan.controller.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

// List all plans for the authenticated user
router.get("/plan", authenticateToken, listTestCasePlans);

// Create a new test-case-plan workflow
router.post("/plan", authenticateToken, createTestCasePlan);

// Get a specific plan by workflowId
router.get("/plan/:workflowId", authenticateToken, getTestCasePlan);

// Regenerate (new version) for an existing plan
router.put("/plan/:workflowId", authenticateToken, regenerateTestCasePlan);

export default router;
