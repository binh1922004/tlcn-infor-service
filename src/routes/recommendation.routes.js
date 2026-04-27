import express from "express";
import { getRecommendedProblems } from "../controllers/recommendation.controller.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/problems", authenticateToken, getRecommendedProblems);

export default router;
