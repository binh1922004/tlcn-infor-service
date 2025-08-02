import express from 'express'
import * as userController from '../controllers/user.controller.js'
import {authenticateToken} from '../middlewares/auth.middleware.js'

const router = express.Router()

router.get('/', authenticateToken, userController.getUsers)

export default router