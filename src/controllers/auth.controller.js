import userModel from '../models/user.models.js';
import bcrypt from 'bcrypt';
import * as authMethod from '../method/auth.method.js';
import randToken from 'rand-token';
import response from '../helpers/response.js';

const SALT_ROUNDS = 10

export const createUser = async (req, res, next) => {
	try {
		const username = req.body.userName
		const userCheck = await userModel.findByUsername(username)
		if (userCheck){
			return response.sendError(res, 'User is existed', 404)
		}
		else{
			const hashPassword = bcrypt.hashSync(req.body.password, SALT_ROUNDS)
			let newUser = req.body
			newUser.password = hashPassword

			const createdUser = await userModel.create(newUser)
			if (!createdUser){
				return response.sendError(res, 'User is existed')
			}
			return response.sendSuccess(res, createdUser)
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
			console.log(bcrypt.compareSync(password, user.password))
			if (!bcrypt.compareSync(password, user.password)){
				return response.sendError(res, 'Password or username is incorrect', 401)
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