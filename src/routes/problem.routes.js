import express from 'express'
import {
    createProblem, getAllProblem,
    getProblemById, getProblemByShortId, getProblems, getProblemStats, toggleStatus, updateProblem,
    uploadProblemImage,
    uploadProblemTestcases,
    getProblemsByClassroom,
    getPublicProblemsForSelection
} from "../controllers/problem.controller.js";
import upload, {uploadZip} from "../middlewares/upload.middlewares.js";
import {authenticateToken, optionalAuth, verifyAdmin} from "../middlewares/auth.middleware.js";
const router = express.Router()

router.post('/upload/image/:id', authenticateToken, verifyAdmin, upload.single('image'), uploadProblemImage);
router.post('/', authenticateToken, verifyAdmin, createProblem);
router.get('/:id', optionalAuth, getProblemById);
router.put('/:id', authenticateToken, verifyAdmin, updateProblem);
router.get('/short/:id', optionalAuth, getProblemByShortId);
router.post('/upload/testcase/:id', authenticateToken, verifyAdmin, uploadZip.single('file'), uploadProblemTestcases);
router.get('/', getProblems);
router.get('/admin/stats', authenticateToken, verifyAdmin, getProblemStats);
router.get('/admin/problems', authenticateToken, verifyAdmin, getAllProblem);
router.patch('/admin/toggle/:id', authenticateToken, verifyAdmin, toggleStatus);
router.get('/classroom/:classroomId', authenticateToken, getProblemsByClassroom);
router.get('/public/selection', getPublicProblemsForSelection);
export default router