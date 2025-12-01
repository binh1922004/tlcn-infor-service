import cloudinary from '../../config/cloudinary.js';
import { Readable } from 'stream';

/**
 * Determine resource_type based on file mimetype
 */
const getResourceType = (mimetype) => {
  if (!mimetype) return 'auto';
  
  if (mimetype.startsWith('image/')) {
    return 'image';
  } else if (mimetype.startsWith('video/')) {
    return 'video';
  } else {
    // For PDFs, docs, archives, etc.
    return 'raw';
  }
};

/**
 * Get file extension from mimetype or filename
 */
const getFileExtension = (mimetype, filename) => {
  // Extract from filename first
  if (filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext && ext.length <= 5) {
      return ext;
    }
  }

  // Fallback to mimetype mapping
  const mimeToExt = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip',
    'application/x-rar-compressed': 'rar',
    'application/x-7z-compressed': '7z',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi'
  };

  return mimeToExt[mimetype] || 'bin';
};

/**
 * Clean filename for use in public_id
 */
const cleanFilename = (filename) => {
  return filename
    .replace(/\s+/g, '_')           // Replace spaces with underscore
    .replace(/[^\w\.-]/g, '')       // Remove special chars except dots, dashes, underscores
    .replace(/_{2,}/g, '_');        // Replace multiple underscores with single
};

/**
 * Upload buffer to Cloudinary with proper resource type
 */
export const uploadToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const mimetype = options.mimetype || options.file?.mimetype;
    const filename = options.filename || options.file?.originalname || 'file';
    const resourceType = getResourceType(mimetype);
    const extension = getFileExtension(mimetype, filename);

    console.log('🔍 Upload info:', {
      mimetype,
      filename,
      resourceType,
      extension
    });

    // ✅ Keep original filename WITH extension for raw files
    let publicId = options.public_id;
    
    if (!publicId) {
      const timestamp = Date.now();
      const filenameWithoutExt = filename.replace(/\.[^/.]+$/, '');
      const cleanName = cleanFilename(filenameWithoutExt);
      
      // ✅ For raw files, add extension back to public_id
      if (resourceType === 'raw') {
        publicId = `${timestamp}_${cleanName}.${extension}`;
      } else {
        publicId = `${timestamp}_${cleanName}`;
      }
    }

    console.log('📝 Public ID:', publicId);

    // Upload options
    const uploadOptions = {
      resource_type: resourceType,
      folder: options.folder || 'materials',
      public_id: publicId,
      use_filename: false,
      unique_filename: false,
      overwrite: false
    };

    console.log('☁️ Uploading to Cloudinary:', {
      resource_type: uploadOptions.resource_type,
      folder: uploadOptions.folder,
      public_id: uploadOptions.public_id
    });

    // Upload stream
    cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error('❌ Cloudinary upload error:', {
            message: error.message,
            name: error.name,
            http_code: error.http_code
          });
          reject(error);
        } else {
          console.log('✅ Cloudinary upload success:', {
            public_id: result.public_id,
            resource_type: result.resource_type,
            format: result.format,
            url: result.secure_url
          });
          resolve(result);
        }
      }
    ).end(buffer);
  });
};

/**
 * Delete from Cloudinary using public_id
 */
export const deleteFromCloudinary = async (publicId, options = {}) => {
  try {
    console.log('🗑️ Deleting from Cloudinary:', {
      publicId,
      resource_type: options.resource_type || 'raw'
    });

    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: options.resource_type || 'raw',
      invalidate: true
    });
    
    console.log('✅ Deleted from Cloudinary:', publicId, result);
    return result;
  } catch (error) {
    console.error('❌ Cloudinary deletion error:', error);
    throw error;
  }
};

/**
 * Delete multiple files from Cloudinary
 */
export const deleteMultipleFromCloudinary = async (publicIds, options = {}) => {
  try {
    const result = await cloudinary.api.delete_resources(publicIds, {
      resource_type: options.resource_type || 'raw',
      invalidate: true
    });
    
    console.log('✅ Deleted multiple from Cloudinary:', publicIds.length, 'files');
    return result;
  } catch (error) {
    console.error('❌ Cloudinary batch deletion error:', error);
    throw error;
  }
};

/**
 * Get file info from Cloudinary
 */
export const getCloudinaryFileInfo = async (publicId, options = {}) => {
  try {
    const result = await cloudinary.api.resource(publicId, {
      resource_type: options.resource_type || 'raw'
    });
    return result;
  } catch (error) {
    console.error('❌ Cloudinary get file info error:', error);
    throw error;
  }
};

/**
 * Generate signed URL for private files
 */
export const getSignedUrl = (publicId, options = {}) => {
  try {
    const signedUrl = cloudinary.url(publicId, {
      resource_type: options.resource_type || 'raw',
      type: 'upload',
      sign_url: true,
      secure: true,
      expires_at: options.expiresAt || Math.floor(Date.now() / 1000) + 3600,
      ...options
    });
    return signedUrl;
  } catch (error) {
    console.error('❌ Error generating signed URL:', error);
    throw error;
  }
};

export default {
  uploadToCloudinary,
  deleteFromCloudinary,
  deleteMultipleFromCloudinary,
  getCloudinaryFileInfo,
  getSignedUrl
};