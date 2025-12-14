import express from 'express'
import {
    createProblem, getAllProblem,
    getProblemById, getProblemByShortId, getProblems, getProblemStats, toggleStatus, updateProblem,
    uploadProblemImage,
    uploadProblemTestcases,
    getProblemsByClassroom,
    getPublicProblemsForSelection,
    getMyProblems
} from "../controllers/problem.controller.js";
import upload, {uploadZip} from "../middlewares/upload.middlewares.js";
import {authenticateToken, optionalAuth, verifyAdmin, verifyAdminOrTeacher} from "../middlewares/auth.middleware.js";
const router = express.Router()

router.post('/upload/image/:id', authenticateToken, verifyAdminOrTeacher, upload.single('image'), uploadProblemImage);
router.post('/', authenticateToken, verifyAdminOrTeacher, createProblem);
router.get('/:id', optionalAuth, getProblemById);
router.put('/:id', authenticateToken, verifyAdminOrTeacher, updateProblem);
router.get('/short/:id', optionalAuth, getProblemByShortId);
router.post('/upload/testcase/:id', authenticateToken, verifyAdminOrTeacher, uploadZip.single('file'), uploadProblemTestcases);
router.get('/', getProblems);
router.get('/admin/stats', authenticateToken, verifyAdminOrTeacher, getProblemStats);
router.get('/admin/problems', authenticateToken, verifyAdminOrTeacher, getAllProblem);
router.patch('/admin/toggle/:id', authenticateToken, verifyAdminOrTeacher, toggleStatus);
router.get('/classroom/:classroomId', authenticateToken, getProblemsByClassroom);
router.get('/public/selection', getPublicProblemsForSelection);
router.get('/my/problems', authenticateToken, getMyProblems);
export default router