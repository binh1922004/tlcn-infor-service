import express from 'express';
import { 
  getDashboardStatistics, 
  getUserGrowthStatistics,
  getSubmissionsByLanguage,
  getProblemsByTags,
  getPublicStatistics // ✅ Add this
} from '../controllers/statistics.controller.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { verifyAdmin } from '../middlewares/auth.middleware.js'; // ✅ Change from isAdmin

const router = express.Router();

// ✅ PUBLIC ROUTE - No authentication required
router.get('/public', getPublicStatistics);

// ✅ ADMIN ROUTES - Require admin authentication
router.use(authenticateToken);
router.use(verifyAdmin); // ✅ Change from isAdmin

// Dashboard overview statistics
router.get('/dashboard', getDashboardStatistics);

// User growth over time
router.get('/user-growth', getUserGrowthStatistics);

// Submissions by programming language
router.get('/submissions-by-language', getSubmissionsByLanguage);

// Problems by tags
router.get('/problems-by-tags', getProblemsByTags);

export default router;