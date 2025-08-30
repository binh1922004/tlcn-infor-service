import express from 'express'
import * as userController from '../controllers/user.controller.js'
import {authenticateToken} from '../middlewares/auth.middleware.js'

const router = express.Router()

router.get('/', authenticateToken, userController.getUsers)
router.get('/profile/:username', userController.getUserByUsername)
router.put('/profile/update', authenticateToken, userController.updateUser)
router.put('/profile/upload/avatar', authenticateToken, userController.updateAvatar);
export default router