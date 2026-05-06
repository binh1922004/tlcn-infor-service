import express from "express";
import {
    addUserMessage,
    getAiHintEligibilityByProblem,
    getConversationByProblem,
    markConversationViewed,
    requestFollowUpHint,
} from "../controllers/aiConversation.controller.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/problem/:problemRef", authenticateToken, getConversationByProblem);
router.get("/problem/:problemRef/eligibility", authenticateToken, getAiHintEligibilityByProblem);
router.post("/problem/:problemRef/messages", authenticateToken, addUserMessage);
router.post("/problem/:problemRef/request-hint", authenticateToken, requestFollowUpHint);
router.patch("/problem/:problemRef/viewed", authenticateToken, markConversationViewed);

export default router;
