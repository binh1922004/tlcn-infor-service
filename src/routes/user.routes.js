import express from 'express'
import * as userController from '../controllers/user.controller.js'
import {authenticateToken} from '../middlewares/auth.middleware.js'
import { uploadAvatar, getUserAvatar, deleteAvatar } from '../controllers/uploadAvatar.controller.js'
import upload from '../middlewares/upload.middlewares.js'
const router = express.Router()

router.get('/', authenticateToken, userController.getUsers)
router.get('/profile/:username', userController.getUserByUsername)
router.put('/profile/update', authenticateToken, userController.updateUser)
// Routes upload avatar với Cloudinary
router.post('/profile/avatar/upload', authenticateToken, upload.single('avatar'), uploadAvatar)
router.get('/profile/avatar/:userId', getUserAvatar)
router.delete('/profile/avatar/:userId', authenticateToken, deleteAvatar)
export default router