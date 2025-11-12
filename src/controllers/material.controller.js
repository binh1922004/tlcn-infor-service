import materialModel from '../models/material.model.js';
import classroomModel from '../models/classroom.model.js';
import response from '../helpers/response.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinary.js';

/**
 * Get all materials in classroom
 * Route: GET /api/classroom/class/:classCode/materials
 */
export const getMaterials = async (req, res) => {
  try {
    const classroom = req.classroom;
    const { category, search, sort = 'recent' } = req.query;

    console.log('📚 Getting materials:', {
      classroomId: classroom._id,
      classCode: classroom.classCode,
      category,
      search
    });

    let materials;

    if (search) {
      // Text search
      materials = await materialModel.searchMaterials(classroom._id, search, { category });
    } else {
      // Regular query
      const sortOptions = {
        recent: { createdAt: -1 },
        oldest: { createdAt: 1 },
        popular: { downloads: -1 },
        views: { views: -1 },
        name: { title: 1 }
      };

      materials = await materialModel.findByClassroom(classroom._id, {
        category,
        sort: sortOptions[sort] || sortOptions.recent
      });
    }

    return response.sendSuccess(res, {
      materials,
      total: materials.length,
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

    // Increment view count
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
      userId
    });

    if (!req.file) {
      return response.sendError(res, 'File là bắt buộc', 400);
    }

    if (!title) {
      return response.sendError(res, 'Tiêu đề là bắt buộc', 400);
    }

    // Upload file to Cloudinary
    const uploadResult = await uploadToCloudinary(req.file.buffer, {
      folder: `classrooms/${classroom.classCode}/materials`,
      resource_type: 'auto',
      public_id: `${Date.now()}_${req.file.originalname.replace(/\s+/g, '_')}`
    });

    console.log('☁️ Cloudinary upload result:', {
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id
    });

    // Create material document
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
      metadata: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        extension: req.file.originalname.split('.').pop(),
        uploadedAt: new Date()
      }
    });

    await material.populate('uploadedBy', 'userName fullName avatar email');

    console.log('✅ Material created:', material._id);

    return response.sendSuccess(res, { material }, 'Tải tài liệu thành công');
  } catch (error) {
    console.error('❌ Error uploading material:', error);
    return response.sendError(res, error.message || 'Internal server error', 500);
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

    // Check ownership (only uploader, classroom owner, or teachers can update)
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

    // Increment download count
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