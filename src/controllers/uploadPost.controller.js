import cloudinary from '../../config/cloudinary.js';
import Post from '../models/post.model.js';
import response from '../helpers/response.js';

// Upload multiple images for post
export const uploadPostImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return response.sendError(res, 'Không có file ảnh được tải lên', 400);
    }
    if (!req.userName) {
      return response.sendError(res, 'User không được xác thực', 401);
    }
    if (req.files.length > 5) {
      return response.sendError(res, 'Chỉ được upload tối đa 5 ảnh', 400);
    }

    const uploadPromises = req.files.map((file, index) => {
      return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            resource_type: 'image',
            folder: 'post_images',
            public_id: `post_${req.userName}_${Date.now()}_${index}`,
            transformation: [
              { 
                width: 1200, 
                height: 800, 
                crop: 'limit',
                quality: 'auto:good'
              }
            ],
            format: 'jpg'
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve({
                url: result.secure_url,
                publicId: result.public_id,
                width: result.width,
                height: result.height,
                size: result.bytes,
                originalName: file.originalname
              });
            }
          }
        ).end(file.buffer);
      });
    });

    // Upload tất cả ảnh song song
    const uploadResults = await Promise.all(uploadPromises);
    return response.sendSuccess(res, {
      images: uploadResults,
      totalImages: uploadResults.length,
      userName: req.userName
    }, 'Upload ảnh bài đăng thành công', 200);

  } catch (error) {
    return response.sendError(res, 'Lỗi server khi upload ảnh', 500, 
      process.env.NODE_ENV === 'development' ? error.message : null
    );
  }
};

export const uploadSingleImage = async (req, res) => {
  try {   
    if (!req.file) {
      return response.sendError(res, 'Không có file ảnh được tải lên', 400);
    }
    if (!req.userName) {
      return response.sendError(res, 'User không được xác thực', 401);
    }
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: 'post_content_images',
          public_id: `content_${req.userName}_${Date.now()}`,
          transformation: [
            { 
              width: 800, 
              height: 600, 
              crop: 'limit',
              quality: 'auto:good'
            }
          ],
          format: 'jpg'
        },
        (error, result) => {
          if (error) {
            console.error('❌ Cloudinary upload error:', error);
            reject(error);
          } else {
            resolve(result);
          }
        }
      ).end(req.file.buffer);
    });
    return response.sendSuccess(res, {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      size: result.bytes,
      originalName: req.file.originalname
    }, 'Upload ảnh content thành công', 200);

  } catch (error) {
    return response.sendError(res, 'Lỗi server khi upload ảnh', 500, 
      process.env.NODE_ENV === 'development' ? error.message : null
    );
  }
};
export const deletePostImages = async (imagePublicIds) => {
  try {
    if (!imagePublicIds || imagePublicIds.length === 0) return;
    
    const deletePromises = imagePublicIds.map(publicId => 
      cloudinary.uploader.destroy(publicId)
    );
    
    const results = await Promise.all(deletePromises);
    
    return results;
  } catch (error) {
    throw error;
  }
};

// Get post images by post ID
export const getPostImages = async (req, res) => {
  try {
    const { postId } = req.params;
    
    const post = await Post.findById(postId).select('images title author');
    
    if (!post) {
      return response.sendError(res, 'Không tìm thấy bài đăng', 404);
    }
    return response.sendSuccess(res, {
      postId: post._id,
      title: post.title,
      images: post.images || []
    }, 'Lấy ảnh bài đăng thành công', 200);

  } catch (error) {
    return response.sendError(res, 'Lỗi server khi lấy ảnh', 500,
      process.env.NODE_ENV === 'development' ? error.message : null
    );
  }
};