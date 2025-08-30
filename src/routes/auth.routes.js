import * as authController from "../controllers/auth.controller.js";
import express from 'express';
import { forgotPasswordSendOtp, forgotPasswordVerifyOtp, resetPassword } from "../controllers/forgotPassword.controller.js";
import { verifyOtpRegister, resendOtpRegister } from "../controllers/otp.controller.js";
const router = express.Router()


router.post('/register', authController.createUser)
router.post('/', authController.login)

//refresh Token
router.post('/refresh', authController.refreshToken)

// Register OTP
router.post("/register/resend-otp", resendOtpRegister);
router.post("/register/verify-otp", verifyOtpRegister);

//Forgot Password
router.post("/forgot-password/send-otp", forgotPasswordSendOtp);
router.post("/forgot-password/verify-otp", forgotPasswordVerifyOtp);
router.post("/forgot-password/reset", resetPassword);

export default router