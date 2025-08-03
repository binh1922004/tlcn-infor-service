import response from '../helpers/response.js';
import userModel from '../models/user.models.js';
export const getUsers = async (req, res, next) => {
	try {
		const users = await userModel.find()
		res.json(users)
	}
	catch (err) {
		next(err)
	}
}

export const getUserByUsername = async(req, res, next) => {
	try {
		const username = req.params.username
		const user = await userModel.findByUsername(username)
		if (!user){
			return response.sendError(res, 'User is not existed', 404)
		}
		
		return response.sendSuccess(res, {
			_id: user._id, 
			username: user.username,
			fullName: user.fullName,
			isOwner: req.username != null && user.id == req.username,
			dob: user.dob
		})
	}
	catch (err) {
		next(err)
	}
}