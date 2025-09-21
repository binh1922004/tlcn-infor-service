import express from 'express'
import {
    createProblem,
    getProblemById,
    uploadProblemImage,
    uploadProblemTestcases
} from "../controllers/problem.controller.js";
import upload, {uploadZip} from "../middlewares/upload.middlewares.js";
const router = express.Router()

router.post('/upload/image/:id', upload.single('image'), uploadProblemImage);
router.post('/create', createProblem);
router.get('/:id', getProblemById);
router.post('/upload/testcase/:id', uploadZip.single('file'), uploadProblemTestcases);
export default router