import express from 'express';
import {authenticateToken} from "../middlewares/auth.middleware.js";
import {getAllPublicContests} from "../controllers/contest.controller.js";
const router = express.Router()

router.get('/', getAllPublicContests);
export default router