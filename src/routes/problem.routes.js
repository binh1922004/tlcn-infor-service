import express from 'express'
import {
    createProblem, getAllProblem,
    getProblemById, getProblemByShortId, getProblems, getProblemStats, toggleStatus, updateProblem,
    uploadProblemImage,
    uploadProblemTestcases,
    getProblemsByClassroom,
    getPublicProblemsForSelection,
    getMyProblems, createPreSignedUrl
} from "../controllers/problem.controller.js";
import upload, {uploadZip} from "../middlewares/upload.middlewares.js";
import {authenticateToken, optionalAuth, verifyAdmin, verifyAdminOrTeacher} from "../middlewares/auth.middleware.js";
const router = express.Router()

// ── Static / prefix routes MUST come before /:id to avoid route shadowing ─────

// Admin routes
router.get('/admin/stats', authenticateToken, verifyAdminOrTeacher, getProblemStats);
router.get('/admin/problems', authenticateToken, verifyAdminOrTeacher, getAllProblem);
router.patch('/admin/toggle/:id', authenticateToken, verifyAdminOrTeacher, toggleStatus);

// Short-id lookup
router.get('/short/:id', optionalAuth, getProblemByShortId);

// Classroom problems
router.get('/classroom/:classroomId', authenticateToken, getProblemsByClassroom);

// Public selection (no auth required)
router.get('/public/selection', getPublicProblemsForSelection);

// My problems
router.get('/my/problems', authenticateToken, getMyProblems);

// Upload routes
router.post('/upload/image/:id', authenticateToken, verifyAdminOrTeacher, upload.single('image'), uploadProblemImage);
router.post('/upload/testcase/:id', authenticateToken, verifyAdminOrTeacher, uploadZip.single('file'), uploadProblemTestcases);
router.post('/upload/testcase/:id/url', authenticateToken, verifyAdminOrTeacher, createPreSignedUrl);

// ── Public list ───────────────────────────────────────────────────────────────
router.get('/', getProblems);

// ── Create ────────────────────────────────────────────────────────────────────
router.post('/', authenticateToken, verifyAdminOrTeacher, createProblem);

// ── Dynamic /:id — MUST be LAST to avoid shadowing the static routes above ────
router.get('/:id', optionalAuth, getProblemById);
router.put('/:id', authenticateToken, verifyAdminOrTeacher, updateProblem);

export default router