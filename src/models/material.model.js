import mongoose from 'mongoose';

const materialSchema = new mongoose.Schema({
  classroom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Classroom',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  fileUrl: {
    type: String,
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number, // in bytes
    required: true
  },
  fileType: {
    type: String, // pdf, docx, pptx, etc.
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  category: {
    type: String,
    enum: ['lecture', 'assignment', 'reference', 'exam', 'other'],
    default: 'lecture',
    index: true
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  downloads: {
    type: Number,
    default: 0
  },
  views: {
    type: Number,
    default: 0
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  status: {
    type: String,
    enum: ['active', 'archived', 'deleted'],
    default: 'active',
    index: true
  },
  // Cloud storage info
  cloudinaryPublicId: String,
  cloudinaryResourceType: String,
  // Metadata
  metadata: {
    originalName: String,
    mimeType: String,
    extension: String,
    uploadedAt: Date
  }
}, {
  timestamps: true
});

// ===== Indexes =====
materialSchema.index({ classroom: 1, status: 1, createdAt: -1 });
materialSchema.index({ classroom: 1, category: 1, status: 1 });
materialSchema.index({ uploadedBy: 1, createdAt: -1 });
materialSchema.index({ tags: 1 });

// Text search index
materialSchema.index({ 
  title: 'text', 
  description: 'text', 
  tags: 'text',
  fileName: 'text'
});

// ===== Virtual Fields =====
materialSchema.virtual('fileSizeFormatted').get(function() {
  if (this.fileSize === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(this.fileSize) / Math.log(k));
  return Math.round(this.fileSize / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
});

// ===== Methods =====

// Increment download count
materialSchema.methods.incrementDownload = function() {
  this.downloads += 1;
  return this.save();
};

// Increment view count
materialSchema.methods.incrementView = function() {
  this.views += 1;
  return this.save();
};

// Soft delete
materialSchema.methods.softDelete = function() {
  this.status = 'deleted';
  return this.save();
};

// Archive
materialSchema.methods.archive = function() {
  this.status = 'archived';
  return this.save();
};

// Restore
materialSchema.methods.restore = function() {
  this.status = 'active';
  return this.save();
};

// ===== Statics =====

// Find by classroom
materialSchema.statics.findByClassroom = function(classroomId, options = {}) {
  const query = { 
    classroom: classroomId,
    status: 'active'
  };

  if (options.category && options.category !== 'all') {
    query.category = options.category;
  }

  if (options.uploadedBy) {
    query.uploadedBy = options.uploadedBy;
  }

  return this.find(query)
    .populate('uploadedBy', 'userName fullName avatar email')
    .sort(options.sort || { createdAt: -1 });
};

// Search materials
materialSchema.statics.searchMaterials = function(classroomId, searchTerm, options = {}) {
  const query = {
    classroom: classroomId,
    status: 'active',
    $text: { $search: searchTerm }
  };

  if (options.category && options.category !== 'all') {
    query.category = options.category;
  }

  return this.find(query, { score: { $meta: 'textScore' } })
    .populate('uploadedBy', 'userName fullName avatar email')
    .sort({ score: { $meta: 'textScore' } });
};

// Get statistics
materialSchema.statics.getStats = async function(classroomId) {
  const stats = await this.aggregate([
    { 
      $match: { 
        classroom: new mongoose.Types.ObjectId(classroomId),
        status: 'active'
      }
    },
    {
      $group: {
        _id: null,
        totalMaterials: { $sum: 1 },
        totalDownloads: { $sum: '$downloads' },
        totalViews: { $sum: '$views' },
        totalSize: { $sum: '$fileSize' },
        byCategory: {
          $push: {
            category: '$category',
            count: 1
          }
        }
      }
    }
  ]);

  const categoryStats = await this.aggregate([
    {
      $match: {
        classroom: new mongoose.Types.ObjectId(classroomId),
        status: 'active'
      }
    },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 }
      }
    }
  ]);

  return {
    ...(stats[0] || {
      totalMaterials: 0,
      totalDownloads: 0,
      totalViews: 0,
      totalSize: 0
    }),
    categoryStats
  };
};

// Get recent materials
materialSchema.statics.getRecent = function(classroomId, limit = 5) {
  return this.find({
    classroom: classroomId,
    status: 'active'
  })
    .populate('uploadedBy', 'userName fullName avatar')
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Get popular materials (by downloads)
materialSchema.statics.getPopular = function(classroomId, limit = 5) {
  return this.find({
    classroom: classroomId,
    status: 'active'
  })
    .populate('uploadedBy', 'userName fullName avatar')
    .sort({ downloads: -1 })
    .limit(limit);
};


// Pre-save hook
materialSchema.pre('save', function(next) {
  // Extract metadata if not set
  if (!this.metadata.originalName) {
    this.metadata.originalName = this.fileName;
    this.metadata.mimeType = this.fileType;
    this.metadata.extension = this.fileName.split('.').pop();
    this.metadata.uploadedAt = new Date();
  }
  next();
});

// Post-remove hook (cleanup)
materialSchema.post('remove', async function(doc) {
  console.log('🗑️ Material removed, cleanup needed:', doc._id);
  // You can trigger Cloudinary deletion here if needed
});

export default mongoose.model('Material', materialSchema);