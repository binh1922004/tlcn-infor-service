import express from 'express';
import multer from 'multer';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { 
  uploadPostImages, 
  uploadSingleImage, 
  getPostImages 
} from '../controllers/uploadPost.controller.js';

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 5 // Max 5 files
  },
  fileFilter: (req, file, cb) => {
    // Chỉ cho phép upload ảnh
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ cho phép upload file ảnh'), false);
    }
  }
});

// Routes
router.post('/multiple', authenticateToken, upload.array('images', 5), uploadPostImages);

router.post('/single', authenticateToken, upload.single('image'), uploadSingleImage);

router.get('/:postId/images', getPostImages);
export default router;