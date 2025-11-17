import multer from 'multer';

const storage = multer.memoryStorage();

// Image upload middleware (existing)
export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file ảnh (jpg, png, gif, webp)!'), false);
    }
  },
});

// ZIP upload middleware (existing)
export const uploadZip = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
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

// Document upload middleware for materials
export const uploadDocument = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB for documents
  },
  fileFilter: (req, file, cb) => {
    // Allowed document types
    const allowedMimes = [
      // Documents
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // Text
      'text/plain',
      'text/csv',
      // Images
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      // Archives
      'application/zip',
      'application/x-zip-compressed',
      'application/x-rar-compressed',
      'application/x-7z-compressed',
      // Videos
      'video/mp4',
      'video/x-msvideo',
      'video/quicktime',
      'video/x-matroska',
      // Audio
      'audio/mpeg',
      'audio/wav',
      'audio/mp4'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Loại file không được hỗ trợ! 
        Chấp nhận: PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, 
        TXT, CSV, ZIP, RAR, 7Z, 
        Images (JPG, PNG, GIF, WebP), 
        Videos (MP4, AVI, MOV, MKV), 
        Audio (MP3, WAV, M4A)`), false);
    }
  },
});

//  Multiple files upload 
export const uploadMultipleDocuments = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file
    files: 10 // Max 10 files at once
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/zip',
      'video/mp4'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Một hoặc nhiều file có loại không được hỗ trợ!'), false);
    }
  },
});

export default upload;