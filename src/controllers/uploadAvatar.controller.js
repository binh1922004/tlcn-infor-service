import cloudinary from '../../config/cloudinary.js';
import User from '../models/user.models.js'; // Adjust path theo model của bạn
import response from '../helpers/response.js';

// Upload avatar controller
export const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return response.sendError(res, 'Không có file được tải lên', 400);
    }
    const currentUser = await User.findById(req.user?.id);
    // Upload to Cloudinary với folder cụ thể
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: 'user_avatars', // Folder cụ thể để lưu avatar
          public_id: `avatar_${Date.now()}`, // Tên file unique
          transformation: [
            { 
              width: 300, 
              height: 300, 
              crop: 'fill',
              gravity: 'face' // Focus vào khuôn mặt khi crop
            }
          ],
          format: 'jpg', // Convert về JPG để giảm dung lượng
          quality: 'auto:good' // Tự động tối ưu chất lượng
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(req.file.buffer);
    });
     if (currentUser?.avatarPublicId) {
      await deleteOldAvatar(currentUser.avatarPublicId);
    }

    // Cập nhật avatar trong database (nếu có user authentication)
    if (req.user?.id) {
      await User.findByIdAndUpdate(req.user.id, {
        avatar: result.secure_url,
        avatarPublicId: result.public_id // Lưu để xóa sau này
      });
    }

    return response.sendSuccess(res, {
      avatarUrl: result.secure_url,
      publicId: result.public_id,
      folder: result.folder,
      originalFilename: req.file.originalname,
      size: result.bytes
    }, 'Upload avatar thành công', 200);

  } catch (error) {
    console.error('Error uploading avatar:', error);
    return response.sendError(res, 'Lỗi server khi upload avatar', 500, 
      process.env.NODE_ENV === 'development' ? error.message : null
    );
  }
};

// Xóa avatar cũ khi upload avatar mới
export const deleteOldAvatar = async (publicId) => {
  try {
    if (publicId) {
      const result = await cloudinary.uploader.destroy(publicId);
      return result;
    }
  } catch (error) {
    console.error('Error deleting old avatar:', error);
    throw error;
  }
};

// Upload multiple avatars (nếu cần)
export const uploadMultipleAvatars = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return response.sendError(res, 'Không có file được tải lên', 400);
    }

    const uploadPromises = req.files.map((file, index) => 
      new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            resource_type: 'image',
            folder: 'user_avatars',
            public_id: `avatar_${Date.now()}_${index}`,
            transformation: [
              { width: 300, height: 300, crop: 'fill', gravity: 'face' }
            ],
            format: 'jpg',
            quality: 'auto:good'
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        ).end(file.buffer);
      })
    );

    const results = await Promise.all(uploadPromises);

    return response.sendSuccess(res, 
      results.map(result => ({
        avatarUrl: result.secure_url,
        publicId: result.public_id,
        folder: result.folder
      })),
      `Upload ${results.length} ảnh thành công`, 
      200
    );

  } catch (error) {
    console.error('Error uploading multiple avatars:', error);
    return response.sendError(res, 'Lỗi server khi upload ảnh', 500,
      process.env.NODE_ENV === 'development' ? error.message : null
    );
  }
};

// Get user avatar
export const getUserAvatar = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId).select('avatar avatarPublicId');
    
    if (!user) {
      return response.sendError(res, 'Không tìm thấy user', 404);
    }

    return response.sendSuccess(res, {
      avatar: user.avatar,
      avatarPublicId: user.avatarPublicId
    }, 'Lấy avatar thành công', 200);

  } catch (error) {
    console.error('Error getting user avatar:', error);
    return response.sendError(res, 'Lỗi server khi lấy avatar', 500,
      process.env.NODE_ENV === 'development' ? error.message : null
    );
  }
};

// Delete avatar
export const deleteAvatar = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return response.sendError(res, 'Không tìm thấy user', 404);
    }

    // Xóa trên Cloudinary
    if (user.avatarPublicId) {
      await deleteOldAvatar(user.avatarPublicId);
    }

    // Xóa trong database
    await User.findByIdAndUpdate(userId, {
      $unset: { avatar: 1, avatarPublicId: 1 }
    });

    return response.sendSuccess(res, {}, 'Xóa avatar thành công', 200);

  } catch (error) {
    console.error('Error deleting avatar:', error);
    return response.sendError(res, 'Lỗi server khi xóa avatar', 500,
      process.env.NODE_ENV === 'development' ? error.message : null
    );
  }
};