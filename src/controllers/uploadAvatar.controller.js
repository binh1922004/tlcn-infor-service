import cloudinary from '../../config/cloudinary.js';
import User from '../models/user.models.js';
import response from '../helpers/response.js';

// Upload avatar controller
export const uploadAvatar = async (req, res) => {
  try {
    console.log('🔍 Debug info:');
    console.log('- File received:', req.file ? 'Yes' : 'No');
    console.log('- UserName from req:', req.userName);
    
    if (!req.file) {
      return response.sendError(res, 'Không có file được tải lên', 400);
    }

    // Kiểm tra user authentication
    if (!req.userName) {
      return response.sendError(res, 'User không được xác thực', 401);
    }

    // Tìm user bằng userName
    const currentUser = await User.findByUsername(req.userName);
    console.log('- Current user found:', currentUser ? currentUser.userName : 'Not found');
    
    if (!currentUser) {
      return response.sendError(res, 'Không tìm thấy user trong database', 404);
    }

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: 'user_avatars',
          public_id: `avatar_${currentUser._id}_${Date.now()}`, // Sử dụng _id từ database
          transformation: [
            { 
              width: 300, 
              height: 300, 
              crop: 'fill',
              gravity: 'face'
            }
          ],
          format: 'jpg',
          quality: 'auto:good'
        },
        (error, result) => {
          if (error) {
            console.error('❌ Cloudinary upload error:', error);
            reject(error);
          } else {
            console.log('✅ Cloudinary upload success:', result.secure_url);
            resolve(result);
          }
        }
      ).end(req.file.buffer);
    });

    // Xóa avatar cũ nếu có
    if (currentUser.avatarPublicId) {
      console.log('🗑️ Deleting old avatar:', currentUser.avatarPublicId);
      await deleteOldAvatar(currentUser.avatarPublicId);
    }

    // Cập nhật avatar trong database bằng userName
    const updateResult = await User.findOneAndUpdate(
      { userName: req.userName }, // Tìm bằng userName
      {
        avatar: result.secure_url,
        avatarPublicId: result.public_id
      },
      { new: true } // Trả về document sau khi update
    );

    console.log('💾 Database update result:', updateResult ? 'Success' : 'Failed');
    console.log('- New avatar URL:', updateResult?.avatar);
    console.log('- Updated user:', updateResult?.userName);

    return response.sendSuccess(res, {
      avatarUrl: result.secure_url,
      publicId: result.public_id,
      folder: result.folder,
      originalFilename: req.file.originalname,
      size: result.bytes,
      userName: req.userName,
      userId: currentUser._id
    }, 'Upload avatar thành công', 200);

  } catch (error) {
    console.error('❌ Error uploading avatar:', error);
    return response.sendError(res, 'Lỗi server khi upload avatar', 500, 
      process.env.NODE_ENV === 'development' ? error.message : null
    );
  }
};

// Xóa avatar cũ khi upload avatar mới
export const deleteOldAvatar = async (publicId) => {
  try {
    if (publicId) {
      console.log('🗑️ Deleting old avatar from Cloudinary:', publicId);
      const result = await cloudinary.uploader.destroy(publicId);
      console.log('✅ Old avatar deleted:', result);
      return result;
    }
  } catch (error) {
    console.error('❌ Error deleting old avatar:', error);
    throw error;
  }
};

// Get user avatar - cập nhật để dùng userName
export const getUserAvatar = async (req, res) => {
  try {
    const { userName } = req.params; // Thay đổi từ userId sang userName
    
    const user = await User.findByUsername(userName).select('avatar avatarPublicId userName');
    
    if (!user) {
      return response.sendError(res, 'Không tìm thấy user', 404);
    }

    return response.sendSuccess(res, {
      avatar: user.avatar,
      avatarPublicId: user.avatarPublicId,
      userName: user.userName
    }, 'Lấy avatar thành công', 200);

  } catch (error) {
    console.error('Error getting user avatar:', error);
    return response.sendError(res, 'Lỗi server khi lấy avatar', 500,
      process.env.NODE_ENV === 'development' ? error.message : null
    );
  }
};

// Delete avatar - cập nhật để dùng userName  
export const deleteAvatar = async (req, res) => {
  try {
    const { userName } = req.params; // Thay đổi từ userId sang userName
    
    const user = await User.findByUsername(userName);
    
    if (!user) {
      return response.sendError(res, 'Không tìm thấy user', 404);
    }

    // Kiểm tra quyền: chỉ user đó mới được xóa avatar của mình
    if (req.userName !== userName) {
      return response.sendError(res, 'Không có quyền xóa avatar của user khác', 403);
    }

    // Xóa trên Cloudinary
    if (user.avatarPublicId) {
      await deleteOldAvatar(user.avatarPublicId);
    }

    // Xóa trong database
    await User.findOneAndUpdate(
      { userName: userName },
      { $unset: { avatar: 1, avatarPublicId: 1 } }
    );

    return response.sendSuccess(res, {
      userName: userName
    }, 'Xóa avatar thành công', 200);

  } catch (error) {
    console.error('Error deleting avatar:', error);
    return response.sendError(res, 'Lỗi server khi xóa avatar', 500,
      process.env.NODE_ENV === 'development' ? error.message : null
    );
  }
};

// Get current user avatar (dành cho user đã login)
export const getCurrentUserAvatar = async (req, res) => {
  try {
    if (!req.userName) {
      return response.sendError(res, 'User không được xác thực', 401);
    }

    const user = await User.findByUsername(req.userName).select('avatar avatarPublicId userName fullName');
    
    if (!user) {
      return response.sendError(res, 'Không tìm thấy user', 404);
    }

    return response.sendSuccess(res, {
      avatar: user.avatar,
      avatarPublicId: user.avatarPublicId,
      userName: user.userName,
      fullName: user.fullName
    }, 'Lấy avatar của user hiện tại thành công', 200);

  } catch (error) {
    console.error('Error getting current user avatar:', error);
    return response.sendError(res, 'Lỗi server khi lấy avatar', 500,
      process.env.NODE_ENV === 'development' ? error.message : null
    );
  }
};