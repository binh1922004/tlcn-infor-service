import mongoose from 'mongoose';

const imageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: { type: String },
  width: { type: Number },
  height: { type: Number },
  size: { type: Number },
  originalName: { type: String }
}, { _id: false });

const postSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  content: {
    type: String,
    required: true,
    maxlength: 5000
  },
  htmlContent: {
    type: String,
    maxlength: 10000
  },
  codeSnippet: {
    type: String,
    maxlength: 10000
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  images: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },
  hashtags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  likes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  likesCount: {
    type: Number,
    default: 0
  },
  comments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  }],
  commentsCount: {
    type: Number,
    default: 0
  },
  shares: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  sharesCount: {
    type: Number,
    default: 0
  },
  isPublished: {
    type: Boolean,
    default: true
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  viewsCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ hashtags: 1 });
postSchema.index({ isPublished: 1, createdAt: -1 });
postSchema.index({ likesCount: -1 });
postSchema.index({ commentsCount: -1 });

postSchema.pre('save', function(next) {
  // Normalize images to consistent format
  if (this.images && Array.isArray(this.images)) {
    this.images = this.images.map(img => {
      if (typeof img === 'string') {
        return img; // Keep string format
      }
      return img; // Keep object format
    });
  }

  if (this.isModified('likes')) {
    this.likesCount = this.likes.length;
  }
  if (this.isModified('shares')) {
    this.sharesCount = this.shares.length;
  }
  next();
});

// Static methods
postSchema.statics.getPopularPosts = function(limit = 10) {
  return this.find({ isPublished: true })
    .sort({ likesCount: -1, commentsCount: -1, createdAt: -1 })
    .limit(limit)
    .populate('author', 'userName fullName avatar')
    .exec();
};

postSchema.statics.getRecentPosts = function(limit = 10) {
  return this.find({ isPublished: true })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('author', 'userName fullName avatar')
    .exec();
};

// Instance methods
postSchema.methods.addLike = function(userId) {
  const existingLike = this.likes.find(like => like.user.toString() === userId.toString());
  if (!existingLike) {
    this.likes.push({ user: userId });
    this.likesCount = this.likes.length;
  }
  return this.save();
};

postSchema.methods.removeLike = function(userId) {
  this.likes = this.likes.filter(like => like.user.toString() !== userId.toString());
  this.likesCount = this.likes.length;
  return this.save();
};

postSchema.methods.addShare = function(userId) {
  const existingShare = this.shares.find(share => share.user.toString() === userId.toString());
  if (!existingShare) {
    this.shares.push({ user: userId });
    this.sharesCount = this.shares.length;
  }
  return this.save();
};

postSchema.methods.incrementViews = function() {
  this.viewsCount += 1;
  return this.save();
};

const Post = mongoose.model('Post', postSchema);

export default Post;