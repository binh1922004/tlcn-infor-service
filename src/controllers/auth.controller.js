import userModel from '../models/user.models.js'
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10

export const createUser = async (req, res, next) => {
    try {
      const username = req.body.username
      
      const userCheck = await userModel.findByUsername(username)
      if (userCheck){
        res.status(409).send('Username has existed')  
      }
      else{
        const hashPassword = bcrypt.hashSync(req.body.password, SALT_ROUNDS)
        let newUser = req.body
        newUser.password = hashPassword

        const createdUser = await userModel.create(newUser)
        if (!createUser){
          res.status.send('Có lỗi trong quá trình tạo tài khoản, vui lòng thử lại.')
        }
        res.status(201).json(createdUser);        
      }
    } 
    catch (error) {
      next(error);
    }
};
