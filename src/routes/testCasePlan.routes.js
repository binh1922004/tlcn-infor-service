import express from "express";
import {
    createTestCasePlan,
    regenerateTestCasePlan,
    getTestCasePlan,
    listTestCasePlans,
} from "../controllers/testCasePlan.controller.js";
import {
    createTestCaseCode,
    regenerateTestCaseCode,
    getTestCaseCode,
    listTestCaseCodes,
    executeTestCaseCode,
    getTestCaseDownloadUrl,
} from "../controllers/testCaseCode.controller.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

// ---- Plan routes ----

// List all plans for the authenticated user
router.get("/plan", authenticateToken, listTestCasePlans);

// Create a new test-case-plan workflow
router.post("/plan", authenticateToken, createTestCasePlan);

// Get a specific plan by workflowId
router.get("/plan/:workflowId", authenticateToken, getTestCasePlan);

// Regenerate (new version) for an existing plan
router.put("/plan/:workflowId", authenticateToken, regenerateTestCasePlan);

// ---- Code-generate routes ----

// List all code generations for the authenticated user
router.get("/code-generate", authenticateToken, listTestCaseCodes);

// Start code generation for a plan
router.post("/code-generate/:workflowId", authenticateToken, createTestCaseCode);

// Get code generation result for a plan
router.get("/code-generate/:workflowId", authenticateToken, getTestCaseCode);

// Regenerate code with optional feedback
router.put("/code-generate/:workflowId", authenticateToken, regenerateTestCaseCode);

// Execute generated code to generate testcases zip
router.post("/execute/:workflowId", authenticateToken, executeTestCaseCode);

// Generate a presigned S3 download URL for a test case zip
// Query: ?version=<number>  (optional, defaults to latest)
router.get("/download/:workflowId", authenticateToken, getTestCaseDownloadUrl);

export default router;
