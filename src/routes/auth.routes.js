import * as authController from "../controllers/auth.controller.js";
import express from 'express';
import { forgotPasswordSendOtp, forgotPasswordVerifyOtp, resetPassword, resendForgotPasswordOtp } from "../controllers/forgotPassword.controller.js";
import { verifyOtpRegister, resendOtpRegister } from "../controllers/otp.controller.js";
import {authenticateToken} from "../middlewares/auth.middleware.js";
import {onboarding} from "../controllers/auth.controller.js";
const router = express.Router()


router.post('/register', authController.createUser)
router.post('/', authController.login)

//google section
router.get('/google', authController.loginWithGoogle)
router.get('/google/callback', authController.googleCallback)
router.post('/onboarding', authController.onboarding)
router.get('/me', authenticateToken, authController.getCurrentUser);
router.post('/logout', authController.logout);
//refresh Token
router.post('/refresh', authController.refreshToken)

// Register OTP
router.post("/register/resend-otp", resendOtpRegister);
router.post("/register/verify-otp", verifyOtpRegister);

//Forgot Password
router.post("/forgot-password/send-otp", forgotPasswordSendOtp);
router.post("/forgot-password/verify-otp", forgotPasswordVerifyOtp);
router.post("/forgot-password/reset", resetPassword);
router.post("/forgot-password/resend-otp", resendForgotPasswordOtp); 
export default router