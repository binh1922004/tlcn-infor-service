import * as authController from "../controllers/auth.controller.js";
import express from 'express';
const router = express.Router()

router.post('/register', authController.createUser)
router.post('/auth', authController.login)

export default router