import express from 'express'
import * as userController from '../controllers/user.controller.js'
import {authenticateToken, optionalAuth, verifyAdmin, verifyAdminOrOwner} from '../middlewares/auth.middleware.js'
import { uploadAvatar, getUserAvatar, deleteAvatar, getCurrentUserAvatar } from '../controllers/uploadAvatar.controller.js'
import upload from '../middlewares/upload.middlewares.js'
import userStatsRoutes from './userStats.routes.js';
const router = express.Router()

router.get('/', authenticateToken, userController.getUsers)
router.get('/profile/:username', optionalAuth, userController.getProfileByUserName)
router.put('/profile/update', authenticateToken, userController.updateUser) 
// Routes upload avatar với Cloudinary
router.post('/profile/avatar/upload', authenticateToken, upload.single('avatar'), uploadAvatar)
router.get('/profile/avatar/current', authenticateToken, getCurrentUserAvatar) 
router.get('/profile/avatar/:userName', getUserAvatar) 

router.delete('/profile/avatar/:userName', authenticateToken, deleteAvatar)
router.get('/username/check', userController.checkUsername)

// Thống kê và phân tích
router.use('/admin/stats', userStatsRoutes);
router.get('/admin/timeline', authenticateToken, verifyAdmin, userController.getUserRegistrationTimeline)

// Quản lý người dùng
router.get('/admin/list', authenticateToken, verifyAdmin, userController.getUsersList)
router.delete('/admin/:userId', authenticateToken, verifyAdmin, userController.deleteUser)
router.patch('/admin/:userName/status', authenticateToken, verifyAdmin, userController.updateUserStatus)
router.get('/admin/:userName/detail', authenticateToken, verifyAdminOrOwner, userController.getUserByUsername)

export default router