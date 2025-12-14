import userModel from '../models/user.models.js';
import bcrypt from 'bcrypt';
import * as authMethod from '../method/auth.method.js';
import response from '../helpers/response.js';
import {config} from "../../config/env.js";
import ms from 'ms';
import jwt from "jsonwebtoken";
import {generateToken} from "../method/auth.method.js";
import AuthGoogleController from "./google.controller.js";
import {v4 as uuid} from "uuid"

import redisClient from "../utils/redisClient.js";
import sendMail from "../utils/sendMail.js";
import crypto from 'crypto';
import {mapToUserDto} from "../helpers/dto.helpers.js";
const SALT_ROUNDS = 10
const authGoogleController = new AuthGoogleController();

const sendOtpToEmail = async (email, userName) => {
  try {
    // Tạo OTP 6 chữ số
    const otp = crypto.randomInt(100000, 999999).toString();

    // Lưu OTP vào Redis với TTL 120s
    await redisClient.setEx(`otp:register:${email}`, 120, otp);

    // Gửi OTP qua email
    await sendMail(email, "Mã OTP đăng ký", `Mã OTP đăng ký của bạn: ${otp}`);
    
    return { success: true };
  } catch (error) {
    console.error('Send OTP error:', error);
    return { success: false, error };
  }
};

export const createUser = async (req, res, next) => {
	try {
		const username = req.body.userName
		const email = req.body.email;
		const origin = req.headers.origin || req.headers.referer || '';
    const isTeacherSite = origin.includes(config.fe_teacher_localhost_url);
		const userCheck = await userModel.findByUsername(username)
		if (userCheck){
			return response.sendError(res, 'User is existed', 404)
		}
		const emailCheck = await userModel.findOne({ email });
		if (emailCheck) {
			return response.sendError(res, 'Email is already existed', 400);
		}
		else{
			const hashPassword = bcrypt.hashSync(req.body.password, SALT_ROUNDS)
			let newUser = req.body
			newUser.password = hashPassword
			newUser.active = false 
			newUser.role = isTeacherSite ? 'teacher' : 'user';
			console.log(`✅ Creating user with role: ${newUser.role} (Origin: ${origin})`);

			const createdUser = await userModel.create(newUser)
			if (!createdUser){
				return response.sendError(res, 'User is existed')
			}

			const otpResult = await sendOtpToEmail(createdUser.email, createdUser.userName);
			if (otpResult.success) {
				return response.sendSuccess(res, {
					message: 'User created successfully. Please check your email for OTP verification.',
					user: mapToUserDto(createdUser)
				});
			} else {
				return response.sendSuccess(res, {
					message: 'User created successfully but OTP sending failed. Please try to resend OTP.',
					user: mapToUserDto(createdUser)
				});
			}
		}
	} 
	catch (error) {
		next(error);
	}
};

export const login = async (req, res, next) => {
	try{
		const username = req.body.userName
		const password = req.body.password
		
		const user = await userModel.findByUsername(username)
		if (!user){
			return response.sendError(res, 'User not found', 404)
		}
		else{
			if (!bcrypt.compareSync(password, user.password)){
				return response.sendError(res, 'Password or username is incorrect', 401)
			}
			// Thêm kiểm tra active
			if (!user.active) {
				return response.sendError(res, 'Tài khoản chưa được kích hoạt. Hãy xác nhận mã OTP cho tài khoản mình', 401)
			}
			const {accessToken, refreshToken} = authMethod.generateToken(user)
			actionRefreshCookie(res, refreshToken);
			return response.sendSuccess(res, {
				accessToken,
				user: mapToUserDto(user)
			})
		}
	}
	catch (error){
		console.log('Error', error)
		next(error)
	}
}

export const refreshToken = async (req, res, next) => {
	const refresh = req.cookies?.refresh_token;
	if (!refresh) return res.status(401).json({ error: 'Missing refresh token' });

	try {
		const payload = jwt.verify(refresh, config.refreshTokenKey);
		const user = await userModel.findByUsername(payload.userName);
		const {accessToken, refreshToken} = generateToken(user);
		actionRefreshCookie(res, refreshToken);

		return response.sendSuccess(res, {accessToken: accessToken});
	} catch (e) {
		console.error('Error', e);
		return response.sendError(res, 'Invalid/expired refresh token', 401);
	}
}

function actionRefreshCookie(res, token,  isDel=false) {
	if (isDel){
		res.clearCookie('refresh_token', {
			httpOnly: true,
			path: '/api/auth/refresh',        // chỉ gửi cookie tới /auth/*
			maxAge: ms(config.refreshTokenLife),
		});
	}
	else{
		res.cookie('refresh_token', token, {
			httpOnly: true,
			path: '/api/auth/refresh',        // chỉ gửi cookie tới /auth/*
			maxAge: ms(config.refreshTokenLife),
		});
	}
}

function actionEmailCookie(res, email, isDel=false) {
	if (isDel){
		res.clearCookie('email', {
			httpOnly: true,
			path: '/api/auth/onboarding',
			maxAge: 60 * 10 * 1000,
		});
	}
	else{
		res.cookie('email', email, {
			httpOnly: true,
			path: '/api/auth/onboarding',
			maxAge: 60 * 10 * 1000,
		});
	}
}

function actionAccessToken(res, token, isDel=false) {
	if (isDel){
		res.clearCookie('access_token', {
			httpOnly: true,              // tránh XSS
			path: '/',
			maxAge: ms(config.accessTokenLife)
		});
	}
	else{
		res.cookie('access_token', token, {
			httpOnly: true,              // tránh XSS
			path: '/',
			maxAge: ms(config.accessTokenLife)
		});
	}
}

export const getCurrentUser = async (req, res) => {
  try {
    const userName = req.userName;
    const user = await userModel.findOne({ userName: userName });

    if (!user) {
      return response.sendError(res, "User không tồn tại", 404);
    }

    return response.sendSuccess(res, {
      user: mapToUserDto(user)
    }, "Lấy thông tin user thành công");

  } catch (error) {
    console.error('GetCurrentUser error:', error);
    return response.sendError(res, "Token không hợp lệ", 401);
  }
}

export const logout = async (req, res) => {
  try {
    // Clear refresh token cookie
    actionRefreshCookie(res, "", true);
		actionAccessToken(res, "", true);
    return response.sendSuccess(res, {}, "Đăng xuất thành công");

  } catch (error) {
    console.error('Logout error:', error);
    return response.sendError(res, "Lỗi server khi đăng xuất", 500);
  }
};


export const loginWithGoogle = async (req, res, next) => {
	const url = authGoogleController.generateUrl()
	return res.redirect(url);
}

export const googleCallback = async (req, res, next) => {
	const responseData = req.query;
	const payload = await authGoogleController.callBack(responseData.code);
	console.log(payload.email);
	const user = await userModel.findOne({ email: payload.email });
	if (user) {
		if (!user.active) {
			return res.redirect(config.fe_url + '/onboarding');
		}
		const {accessToken, refreshToken} = authMethod.generateToken(user)
		actionRefreshCookie(res, refreshToken);
		return res.redirect(config.fe_localhost_url + '/profile/' + user.userName)
	}
	else{
		actionEmailCookie(res, payload.email);
		const user = {
			email: payload.email,
			fullName: payload.name,
			avatar: payload.picture,
			userName: uuid(),
			isGoogle: true
		}
		await userModel.create(user)
		return res.redirect(config.fe_url + '/onboarding');
	}
}

export const onboarding = async (req, res) => {
	const email = req.cookies?.email;
	if (!email) return response.sendError(res, 'Not found email', 404);
	try{
		const user = await userModel.findOne({email: email, active: false});
		if (!user) {
			return response.sendError(res, 'Not found user', 404);
		}
		const userName = req.query.username;
		if (!userName) {
			return response.sendError(res, 'Missing userName', 404);
		}
		user.userName = userName;
		user.active = true;
		await user.save();
		const {accessToken, refreshToken} = authMethod.generateToken(user)
		actionRefreshCookie(res, refreshToken);
		actionEmailCookie(res, "", true);
		return response.sendSuccess(res, {
			accessToken,
			user: mapToUserDto(user)
		})
	}
	catch (e){
		console.error(e);
		throw e;
	}
}
