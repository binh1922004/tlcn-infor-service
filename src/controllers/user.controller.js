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