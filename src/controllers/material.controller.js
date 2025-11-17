import materialModel from '../models/material.model.js';
import classroomModel from '../models/classroom.model.js';
import response from '../helpers/response.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../service/cloudinary.service.js';

/**
 * Get all materials in classroom
 * Route: GET /api/classroom/class/:classCode/materials
 */
export const getMaterials = async (req, res) => {
  try {
    const classroom = req.classroom;
    const { 
      category, 
      search, 
      sort = 'recent',
      page = 1,
      limit = 9 // ✅ 9 items per page
    } = req.query;

    console.log('📚 Getting materials:', {
      classroomId: classroom._id,
      classCode: classroom.classCode,
      category,
      search,
      page,
      limit
    });

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let query = {
      classroom: classroom._id,
      status: 'active'
    };

    // Filter by category
    if (category && category !== 'all') {
      query.category = category;
    }

    // Search filter
    if (search && search.trim()) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { fileName: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Sort options
    const sortOptions = {
      recent: { createdAt: -1 },
      oldest: { createdAt: 1 },
      popular: { downloads: -1 },
      views: { views: -1 },
      name: { title: 1 }
    };

    const selectedSort = sortOptions[sort] || sortOptions.recent;

    // ✅ Get total count for pagination
    const total = await materialModel.countDocuments(query);

    // ✅ Get paginated materials
    const materials = await materialModel
      .find(query)
      .populate('uploadedBy', 'userName fullName avatar email')
      .sort(selectedSort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // ✅ Calculate pagination info
    const totalPages = Math.ceil(total / limitNum);

    console.log('✅ Materials fetched:', {
      total,
      page: pageNum,
      totalPages,
      count: materials.length
    });

    return response.sendSuccess(res, {
      materials,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      },
      classCode: classroom.classCode
    });
  } catch (error) {
    console.error('❌ Error getting materials:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Get single material
 * Route: GET /api/classroom/class/:classCode/materials/:materialId
 */
export const getMaterial = async (req, res) => {
  try {
    const { materialId } = req.params;
    const classroom = req.classroom;

    const material = await materialModel
      .findOne({
        _id: materialId,
        classroom: classroom._id,
        status: 'active'
      })
      .populate('uploadedBy', 'userName fullName avatar email');

    if (!material) {
      return response.sendError(res, 'Không tìm thấy tài liệu', 404);
    }

    await material.incrementView();

    return response.sendSuccess(res, { material });
  } catch (error) {
    console.error('❌ Error getting material:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Upload material
 * Route: POST /api/classroom/class/:classCode/materials
 */
export const uploadMaterial = async (req, res) => {
  try {
    const classroom = req.classroom;
    const userId = req.user._id;
    const { title, description, category, tags, isPublic } = req.body;

    console.log('📤 Uploading material:', {
      classroomId: classroom._id,
      classCode: classroom.classCode,
      title,
      fileName: req.file?.originalname,
      fileType: req.file?.mimetype,
      fileSize: req.file?.size,
      userId
    });

    if (!req.file) {
      return response.sendError(res, 'File là bắt buộc', 400);
    }

    if (!title) {
      return response.sendError(res, 'Tiêu đề là bắt buộc', 400);
    }

    // Validate file type
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
      'application/zip',
      'application/x-zip-compressed',
      'application/x-rar-compressed',
      'application/x-7z-compressed',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo'
    ];

    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return response.sendError(res, `Loại file không được hỗ trợ: ${req.file.mimetype}`, 400);
    }

    // Validate file size (50MB max)
    const maxSize = 50 * 1024 * 1024;
    if (req.file.size > maxSize) {
      return response.sendError(res, 'Kích thước file tối đa là 50MB', 400);
    }

    // ✅ Upload file to Cloudinary (extension will be preserved by service)
    const uploadResult = await uploadToCloudinary(req.file.buffer, {
      folder: `classrooms/${classroom.classCode}/materials`,
      mimetype: req.file.mimetype,
      filename: req.file.originalname
      // ❌ DON'T pass public_id here - let service generate it with extension
    });

    console.log('☁️ Cloudinary upload result:', {
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      resourceType: uploadResult.resource_type,
      format: uploadResult.format,
      bytes: uploadResult.bytes
    });

    // ✅ Create material document
    const material = await materialModel.create({
      classroom: classroom._id,
      title,
      description,
      fileUrl: uploadResult.secure_url,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      uploadedBy: userId,
      category: category || 'lecture',
      isPublic: isPublic !== false,
      tags: tags ? (Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim())) : [],
      cloudinaryPublicId: uploadResult.public_id,
      cloudinaryResourceType: uploadResult.resource_type,
      cloudinaryFolder: uploadResult.folder,
      cloudinaryUrl: uploadResult.url,
      cloudinarySecureUrl: uploadResult.secure_url,
      metadata: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        extension: uploadResult.format || req.file.originalname.split('.').pop(),
        uploadedAt: new Date(),
        format: uploadResult.format,
        bytes: uploadResult.bytes
      }
    });

    await material.populate('uploadedBy', 'userName fullName avatar email');

    console.log('✅ Material created:', material._id);

    return response.sendSuccess(res, { material }, 'Tải tài liệu thành công');
  } catch (error) {
    console.error('❌ Error uploading material:', error);
    
    let errorMessage = 'Lỗi khi tải tài liệu lên';
    if (error.message) {
      errorMessage = error.message;
    }
    if (error.http_code === 400) {
      errorMessage = 'Không thể upload file. Vui lòng thử lại.';
    }
    
    return response.sendError(res, errorMessage, error.http_code || 500);
  }
};

/**
 * Update material
 * Route: PUT /api/classroom/class/:classCode/materials/:materialId
 */
export const updateMaterial = async (req, res) => {
  try {
    const { materialId } = req.params;
    const classroom = req.classroom;
    const { title, description, category, tags, isPublic } = req.body;

    console.log('✏️ Updating material:', materialId);

    const material = await materialModel.findOne({
      _id: materialId,
      classroom: classroom._id,
      status: 'active'
    });

    if (!material) {
      return response.sendError(res, 'Không tìm thấy tài liệu', 404);
    }

    // Check ownership
    const isOwner = classroom.owner.toString() === req.user._id.toString();
    const isTeacher = classroom.teachers.some(t => t.toString() === req.user._id.toString());
    const isUploader = material.uploadedBy.toString() === req.user._id.toString();

    if (!isOwner && !isTeacher && !isUploader) {
      return response.sendError(res, 'Bạn không có quyền chỉnh sửa tài liệu này', 403);
    }

    // Update fields
    if (title !== undefined) material.title = title;
    if (description !== undefined) material.description = description;
    if (category !== undefined) material.category = category;
    if (isPublic !== undefined) material.isPublic = isPublic;
    if (tags !== undefined) {
      material.tags = Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim());
    }

    await material.save();
    await material.populate('uploadedBy', 'userName fullName avatar email');

    console.log('✅ Material updated');

    return response.sendSuccess(res, { material }, 'Cập nhật tài liệu thành công');
  } catch (error) {
    console.error('❌ Error updating material:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Delete material
 * Route: DELETE /api/classroom/class/:classCode/materials/:materialId
 */
export const deleteMaterial = async (req, res) => {
  try {
    const { materialId } = req.params;
    const classroom = req.classroom;

    console.log('🗑️ Deleting material:', materialId);

    const material = await materialModel.findOne({
      _id: materialId,
      classroom: classroom._id,
      status: 'active'
    });

    if (!material) {
      return response.sendError(res, 'Không tìm thấy tài liệu', 404);
    }

    // Check ownership
    const isOwner = classroom.owner.toString() === req.user._id.toString();
    const isTeacher = classroom.teachers.some(t => t.toString() === req.user._id.toString());
    const isUploader = material.uploadedBy.toString() === req.user._id.toString();

    if (!isOwner && !isTeacher && !isUploader) {
      return response.sendError(res, 'Bạn không có quyền xóa tài liệu này', 403);
    }

    // Delete from Cloudinary
    if (material.cloudinaryPublicId) {
      try {
        await deleteFromCloudinary(material.cloudinaryPublicId, {
          resource_type: material.cloudinaryResourceType || 'auto'
        });
        console.log('✅ Deleted from Cloudinary');
      } catch (cloudinaryError) {
        console.warn('⚠️ Could not delete from Cloudinary:', cloudinaryError);
      }
    }

    // Soft delete
    await material.softDelete();

    console.log('✅ Material deleted (soft)');

    return response.sendSuccess(res, null, 'Xóa tài liệu thành công');
  } catch (error) {
    console.error('❌ Error deleting material:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Download material (increment counter)
 * Route: POST /api/classroom/class/:classCode/materials/:materialId/download
 */
export const downloadMaterial = async (req, res) => {
  try {
    const { materialId } = req.params;
    const classroom = req.classroom;

    const material = await materialModel.findOne({
      _id: materialId,
      classroom: classroom._id,
      status: 'active'
    });

    if (!material) {
      return response.sendError(res, 'Không tìm thấy tài liệu', 404);
    }

    await material.incrementDownload();

    console.log('⬇️ Material downloaded:', material.title);

    return response.sendSuccess(res, {
      downloadUrl: material.fileUrl,
      fileName: material.fileName
    });
  } catch (error) {
    console.error('❌ Error downloading material:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Get material statistics
 * Route: GET /api/classroom/class/:classCode/materials/stats
 */
export const getMaterialStats = async (req, res) => {
  try {
    const classroom = req.classroom;

    console.log('📊 Getting material stats for:', classroom.classCode);

    const stats = await materialModel.getStats(classroom._id);

    return response.sendSuccess(res, stats);
  } catch (error) {
    console.error('❌ Error getting material stats:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Get recent materials
 * Route: GET /api/classroom/class/:classCode/materials/recent
 */
export const getRecentMaterials = async (req, res) => {
  try {
    const classroom = req.classroom;
    const { limit = 5 } = req.query;

    const materials = await materialModel.getRecent(classroom._id, parseInt(limit));

    return response.sendSuccess(res, { materials });
  } catch (error) {
    console.error('❌ Error getting recent materials:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Get popular materials
 * Route: GET /api/classroom/class/:classCode/materials/popular
 */
export const getPopularMaterials = async (req, res) => {
  try {
    const classroom = req.classroom;
    const { limit = 5 } = req.query;

    const materials = await materialModel.getPopular(classroom._id, parseInt(limit));

    return response.sendSuccess(res, { materials });
  } catch (error) {
    console.error('❌ Error getting popular materials:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

export default {
  getMaterials,
  getMaterial,
  uploadMaterial,
  updateMaterial,
  deleteMaterial,
  downloadMaterial,
  getMaterialStats,
  getRecentMaterials,
  getPopularMaterials
};