import express from 'express'
import {createProblem, getProblemById, uploadProblemImage} from "../controllers/problem.controller.js";
import upload from "../middlewares/upload.middlewares.js";
const router = express.Router()

router.post('/upload/image', upload.single('image'), uploadProblemImage);
router.post('/create', createProblem);
router.get('/:id', getProblemById);
export default router