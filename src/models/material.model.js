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
    type: Number,
    required: true
  },
  fileType: {
    type: String,
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
  // ===== Cloudinary Storage Info =====
  cloudinaryPublicId: {
    type: String,
    required: true
  },
  cloudinaryResourceType: {
    type: String,
    default: 'auto'
  },
  cloudinaryFolder: String,
  cloudinaryUrl: String,
  cloudinarySecureUrl: String,
  // ===== Metadata =====
  metadata: {
    originalName: String,
    mimeType: String,
    extension: String,
    uploadedAt: Date,
    width: Number, // For images
    height: Number, // For images
    duration: Number, // For videos/audio
    format: String,
    pages: Number // For PDFs
  }
}, {
  timestamps: true
});

// ===== Indexes =====
materialSchema.index({ classroom: 1, status: 1, createdAt: -1 });
materialSchema.index({ classroom: 1, category: 1, status: 1 });
materialSchema.index({ uploadedBy: 1, createdAt: -1 });
materialSchema.index({ tags: 1 });
materialSchema.index({ cloudinaryPublicId: 1 });

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

materialSchema.virtual('isImage').get(function() {
  return this.fileType?.startsWith('image/');
});

materialSchema.virtual('isVideo').get(function() {
  return this.fileType?.startsWith('video/');
});

materialSchema.virtual('isDocument').get(function() {
  const docTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument',
    'application/vnd.ms-powerpoint',
    'application/vnd.ms-excel'
  ];
  return docTypes.some(type => this.fileType?.includes(type));
});

// ===== Methods =====

materialSchema.methods.incrementDownload = function() {
  this.downloads += 1;
  return this.save();
};

materialSchema.methods.incrementView = function() {
  this.views += 1;
  return this.save();
};

materialSchema.methods.softDelete = function() {
  this.status = 'deleted';
  return this.save();
};

materialSchema.methods.archive = function() {
  this.status = 'archived';
  return this.save();
};

materialSchema.methods.restore = function() {
  this.status = 'active';
  return this.save();
};

// ===== Statics =====

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
        totalSize: { $sum: '$fileSize' }
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
        count: { $sum: 1 },
        totalSize: { $sum: '$fileSize' }
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

materialSchema.statics.getRecent = function(classroomId, limit = 5) {
  return this.find({
    classroom: classroomId,
    status: 'active'
  })
    .populate('uploadedBy', 'userName fullName avatar')
    .sort({ createdAt: -1 })
    .limit(limit);
};

materialSchema.statics.getPopular = function(classroomId, limit = 5) {
  return this.find({
    classroom: classroomId,
    status: 'active'
  })
    .populate('uploadedBy', 'userName fullName avatar')
    .sort({ downloads: -1 })
    .limit(limit);
};

// ===== Hooks =====

materialSchema.pre('save', function(next) {
  if (!this.metadata.originalName) {
    this.metadata.originalName = this.fileName;
    this.metadata.mimeType = this.fileType;
    this.metadata.extension = this.fileName.split('.').pop();
    this.metadata.uploadedAt = new Date();
  }
  next();
});

export default mongoose.model('Material', materialSchema);