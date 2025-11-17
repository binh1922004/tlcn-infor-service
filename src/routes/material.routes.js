import express from 'express';
import {
  getMaterials,
  getMaterial,
  uploadMaterial,
  updateMaterial,
  deleteMaterial,
  downloadMaterial,
  getMaterialStats,
  getRecentMaterials,
  getPopularMaterials
} from '../controllers/material.controller.js';
import { uploadDocument } from '../middlewares/upload.middlewares.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { 
  verifyClassroomAccess, 
  verifyClassroomTeacher,
  checkClassroomActive 
} from '../middlewares/classroom.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// ===== Stats & Special endpoints (before :materialId) =====
router.get('/class/:classCode/materials/stats', verifyClassroomAccess, getMaterialStats);
router.get('/class/:classCode/materials/recent', verifyClassroomAccess, getRecentMaterials);
router.get('/class/:classCode/materials/popular', verifyClassroomAccess, getPopularMaterials);

// ===== CRUD endpoints =====
router.get('/class/:classCode/materials', verifyClassroomAccess, getMaterials);
router.get('/class/:classCode/materials/:materialId', verifyClassroomAccess, getMaterial);

router.post('/class/:classCode/materials', 
  verifyClassroomTeacher, 
  checkClassroomActive, 
  uploadDocument.single('file'), 
  uploadMaterial
);

router.put('/class/:classCode/materials/:materialId', 
  verifyClassroomTeacher, 
  checkClassroomActive, 
  updateMaterial
);

router.delete('/class/:classCode/materials/:materialId', 
  verifyClassroomTeacher, 
  checkClassroomActive, 
  deleteMaterial
);

router.post('/class/:classCode/materials/:materialId/download', 
  verifyClassroomAccess, 
  downloadMaterial
);

export default router;