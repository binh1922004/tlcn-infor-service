import userModel from '../models/user.models.js';
import bcrypt from 'bcrypt';
import * as authMethod from '../method/auth.method.js';
import randToken from 'rand-token';
import response from '../helpers/response.js';

const SALT_ROUNDS = 10


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

			const createdUser = await userModel.create(newUser)
			if (!createdUser){
				return response.sendError(res, 'User is existed')
			}

			const otpResult = await sendOtpToEmail(createdUser.email, createdUser.userName);
			if (otpResult.success) {
				return response.sendSuccess(res, {
					message: 'User created successfully. Please check your email for OTP verification.',
					user: createdUser
				});
			} else {
				return response.sendSuccess(res, {
					message: 'User created successfully but OTP sending failed. Please try to resend OTP.',
					user: createdUser
				});
			}		}
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
			console.log(bcrypt.compareSync(password, user.password))
			if (!bcrypt.compareSync(password, user.password)){
				return response.sendError(res, 'Password or username is incorrect', 401)
			}
			// Thêm kiểm tra active
			if (!user.active) {
				return response.sendError(res, 'Tài khoản chưa được kích hoạt. Hãy xác nhận mã OTP cho tài khoản mình', 401)
			}
			
			const dataForAccessToken = {
				userName: username
			}
			const accessToken = authMethod.generateJwt(dataForAccessToken)
			// let refreshToken = randToken.generate()
			return response.sendSuccess(res, {
				accessToken, 
				user
			})
		}
	}
	catch (error){
		console.log('Error', error)
		next(error)
	}
} 