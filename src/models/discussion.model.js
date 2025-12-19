import mongoose from "mongoose";

const discussionSchema = new mongoose.Schema({
  classroom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Classroom",
    required: true,
    index: true
  },
  
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  
  type: {
    type: String,
    enum: ['announcement', 'question', 'discussion', 'material'],
    default: 'discussion',
    index: true
  },
  
  priority: {
    type: String,
    enum: ['normal', 'important', 'urgent'],
    default: 'normal'
  },
  
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  
  attachments: [{
    fileName: {
      type: String,
      required: true
    },
    fileUrl: {
      type: String,
      required: true
    },
    fileSize: {
      type: Number
    },
    fileType: {
      type: String
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  relatedProblem: {
    type: String,
    default: null
  },
  
  relatedContest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Contest",
    default: null
  },
  
  // REMOVED: comments array - now use separate Comment collection
  
  reactions: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    type: {
      type: String,
      enum: ['like', 'love', 'haha', 'wow', 'sad', 'angry'],
      default: 'like'
    },
    reactedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  views: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    viewedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  isPinned: {
    type: Boolean,
    default: false,
    index: true
  },
  
  pinnedAt: {
    type: Date
  },
  
  pinnedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  
  isLocked: {
    type: Boolean,
    default: false
  },
  
  lockedAt: {
    type: Date
  },
  
  lockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  
  allowComments: {
    type: Boolean,
    default: true
  },
  
  status: {
    type: String,
    enum: ['active', 'archived', 'deleted', 'hidden'],
    default: 'active',
    index: true
  },
  
  isEdited: {
    type: Boolean,
    default: false
  },
  
  editedAt: {
    type: Date
  },
  
  scheduledFor: {
    type: Date,
    default: null
  },
  
  isPublished: {
    type: Boolean,
    default: true
  },
  
  // Stats - now using commentsCount like Post model
  commentsCount: {
    type: Number,
    default: 0,
    index: true
  },
  
  stats: {
    totalComments: {
      type: Number,
      default: 0
    },
    totalReactions: {
      type: Number,
      default: 0
    },
    totalViews: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  collection: "discussions"
});

// Indexes
discussionSchema.index({ classroom: 1, status: 1, createdAt: -1 });
discussionSchema.index({ classroom: 1, type: 1, status: 1 });
discussionSchema.index({ classroom: 1, isPinned: -1, createdAt: -1 });
discussionSchema.index({ author: 1, createdAt: -1 });
discussionSchema.index({ tags: 1 });
discussionSchema.index({ scheduledFor: 1, isPublished: 1 });

// Virtuals
discussionSchema.virtual('commentCount').get(function() {
  return this.commentsCount || this.stats.totalComments || 0;
});

discussionSchema.virtual('reactionCount').get(function() {
  return this.reactions.length;
});

discussionSchema.virtual('viewCount').get(function() {
  return this.views.length;
});

// Virtual populate comments
discussionSchema.virtual('comments', {
  ref: 'DiscussionComment',
  localField: '_id',
  foreignField: 'discussion',
  options: { 
    match: { status: 'active', parentComment: null },
    sort: { createdAt: -1 }
  }
});

// Methods

/**
 * Add reaction
 */
discussionSchema.methods.addReaction = function(userId, reactionType = 'like') {
  this.reactions = this.reactions.filter(
    r => r.userId.toString() !== userId.toString()
  );
  
  this.reactions.push({
    userId,
    type: reactionType,
    reactedAt: new Date()
  });
  
  this.stats.totalReactions = this.reactions.length;
  
  return this.save();
};

/**
 * Remove reaction
 */
discussionSchema.methods.removeReaction = function(userId) {
  this.reactions = this.reactions.filter(
    r => r.userId.toString() !== userId.toString()
  );
  
  this.stats.totalReactions = this.reactions.length;
  
  return this.save();
};

/**
 * Add view
 */
discussionSchema.methods.addView = function(userId) {
  const alreadyViewed = this.views.some(
    v => v.userId.toString() === userId.toString()
  );
  
  if (!alreadyViewed) {
    this.views.push({
      userId,
      viewedAt: new Date()
    });
    
    this.stats.totalViews = this.views.length;
    
    return this.save();
  }
  
  return Promise.resolve(this);
};

/**
 * Pin discussion
 */
discussionSchema.methods.pin = function(userId) {
  this.isPinned = true;
  this.pinnedAt = new Date();
  this.pinnedBy = userId;
  
  return this.save();
};

/**
 * Unpin discussion
 */
discussionSchema.methods.unpin = function() {
  this.isPinned = false;
  this.pinnedAt = null;
  this.pinnedBy = null;
  
  return this.save();
};

/**
 * Lock discussion
 */
discussionSchema.methods.lock = function(userId) {
  this.isLocked = true;
  this.lockedAt = new Date();
  this.lockedBy = userId;
  
  return this.save();
};

/**
 * Unlock discussion
 */
discussionSchema.methods.unlock = function() {
  this.isLocked = false;
  this.lockedAt = null;
  this.lockedBy = null;
  
  return this.save();
};

/**
 * Archive discussion
 */
discussionSchema.methods.archive = function() {
  this.status = 'archived';
  return this.save();
};

/**
 * Get user's reaction
 */
discussionSchema.methods.getUserReaction = function(userId) {
  return this.reactions.find(
    r => r.userId.toString() === userId.toString()
  );
};

// Pre-save middleware
discussionSchema.pre('save', function(next) {
  this.stats.totalComments = this.commentsCount || 0;
  this.stats.totalReactions = this.reactions.length;
  this.stats.totalViews = this.views.length;
  next();
});

// Ensure virtuals are included in JSON
discussionSchema.set('toJSON', { virtuals: true });
discussionSchema.set('toObject', { virtuals: true });

const discussionModel = mongoose.model("Discussion", discussionSchema);

export default discussionModel;