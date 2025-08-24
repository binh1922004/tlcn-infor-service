import * as authController from "../controllers/auth.controller.js";
import express from 'express';
import { forgotPasswordSendOtp, forgotPasswordVerifyOtp, resetPassword } from "../controllers/forgotPassword.controller.js";
const router = express.Router()

router.post('/register', authController.createUser)
router.post('/', authController.login)

//Forgot Password
router.post("/forgot-password/send-otp", forgotPasswordSendOtp);
router.post("/forgot-password/verify-otp", forgotPasswordVerifyOtp);
router.post("/forgot-password/reset", resetPassword);

export default router