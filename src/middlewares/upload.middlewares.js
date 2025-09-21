import multer from 'multer';

const storage = multer.memoryStorage();

export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    // Chỉ chấp nhận file ảnh
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file ảnh (jpg, png, gif, webp)!'), false);
    }
  },
});

// Middleware riêng cho file ZIP
export const uploadZip = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB cho file ZIP
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' ||
        file.mimetype === 'application/x-zip-compressed') {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file ZIP!'), false);
    }
  },
});
export default upload;