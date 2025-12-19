import mongoose from 'mongoose';
import Discussion from './discussion.model.js';

const discussionCommentSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  discussion: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Discussion',
    required: true,
    index: true
  },
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DiscussionComment',
    default: null,
    index: true
  },
  replies: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DiscussionComment'
  }],
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileSize: Number,
    fileType: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
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
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date
  },
  status: {
    type: String,
    enum: ['active', 'deleted', 'hidden'],
    default: 'active'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
discussionCommentSchema.index({ discussion: 1, createdAt: -1 });
discussionCommentSchema.index({ discussion: 1, parentComment: 1 });
discussionCommentSchema.index({ author: 1 });
discussionCommentSchema.index({ discussion: 1, status: 1, parentComment: 1 });

// Virtual to check if user liked comment
discussionCommentSchema.virtual('isLiked').get(function() {
  return this.likes && this.likes.length > 0;
});

// Static methods

/**
 * Get discussion comment stats
 */
discussionCommentSchema.statics.getDiscussionCommentStats = async function(discussionId) {
  try {
    const countResult = await this.aggregate([
      {
        $match: { 
          discussion: new mongoose.Types.ObjectId(discussionId),
          status: 'active'
        }
      },
      {
        $group: {
          _id: null,
          totalComments: { $sum: 1 },
          parentComments: {
            $sum: {
              $cond: [{ $eq: ["$parentComment", null] }, 1, 0]
            }
          },
          replies: {
            $sum: {
              $cond: [{ $ne: ["$parentComment", null] }, 1, 0]
            }
          }
        }
      }
    ]);

    return countResult[0] || { 
      totalComments: 0, 
      parentComments: 0, 
      replies: 0 
    };
  } catch (error) {
    console.error("Error getting discussion comment stats:", error);
    return { 
      totalComments: 0, 
      parentComments: 0, 
      replies: 0 
    };
  }
};

/**
 * Get comments with pagination
 */
discussionCommentSchema.statics.getDiscussionCommentsWithPagination = async function(
  discussionId, 
  page = 1, 
  limit = 20
) {
  try {
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const comments = await this.find({
      discussion: discussionId,
      parentComment: null,
      status: 'active'
    })
      .populate("author", "userName fullName avatar email")
      .populate({
        path: "replies",
        match: { status: 'active' },
        populate: {
          path: "author",
          select: "userName fullName avatar email",
        },
        options: { sort: { createdAt: 1 } },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const stats = await this.getDiscussionCommentStats(discussionId);

    const pagination = {
      currentPage: parseInt(page),
      totalPages: Math.ceil(stats.parentComments / parseInt(limit)),
      totalParentComments: stats.parentComments,
      totalComments: stats.totalComments,
      totalReplies: stats.replies,
      hasNext: page < Math.ceil(stats.parentComments / parseInt(limit)),
      hasPrev: page > 1,
    };

    return { comments, pagination };
  } catch (error) {
    console.error("Error getting comments with pagination:", error);
    throw error;
  }
};

/**
 * Count total replies recursively
 */
discussionCommentSchema.statics.countTotalRepliesRecursive = async function(commentId) {
  const directReplies = await this.find({ 
    parentComment: new mongoose.Types.ObjectId(commentId),
    status: 'active'
  }).select('_id');
  
  if (directReplies.length === 0) return 0;
  
  let total = directReplies.length;
  
  for (const reply of directReplies) {
    const nestedCount = await this.countTotalRepliesRecursive(reply._id);
    total += nestedCount;
  }
  
  return total;
};

// Instance methods

/**
 * Check if user liked this comment
 */
discussionCommentSchema.methods.isLikedByUser = function(userId) {
  if (!this.likes || this.likes.length === 0 || !userId) {
    return false;
  }
  
  return this.likes.some(like => {
    let likeUserId;
    
    if (typeof like === 'string') {
      likeUserId = like;
    } else if (like && typeof like === 'object') {
      likeUserId = like.user || like._id;
    }
    
    return likeUserId && likeUserId.toString() === userId.toString();
  });
};

/**
 * Toggle like
 */
discussionCommentSchema.methods.toggleLike = async function(userId) {
  try {
    const isLiked = this.isLikedByUser(userId);
    
    if (isLiked) {
      this.likes = this.likes.filter(like => like.user.toString() !== userId.toString());
    } else {
      this.likes.push({ user: userId });
    }
    
    this.likesCount = this.likes.length;
    await this.save();
    
    return {
      isLiked: !isLiked,
      likesCount: this.likesCount
    };
  } catch (error) {
    console.error("Error toggling like:", error);
    throw error;
  }
};

/**
 * Add reply reference
 */
discussionCommentSchema.methods.addReply = async function(replyId) {
  try {
    if (!this.replies.includes(replyId)) {
      this.replies.push(replyId);
      await this.save();
    }
    return this;
  } catch (error) {
    console.error("Error adding reply:", error);
    throw error;
  }
};

/**
 * Remove reply reference
 */
discussionCommentSchema.methods.removeReply = async function(replyId) {
  try {
    this.replies = this.replies.filter(reply => reply.toString() !== replyId.toString());
    await this.save();
    return this;
  } catch (error) {
    console.error("Error removing reply:", error);
    throw error;
  }
};

/**
 * Get total replies count
 */
discussionCommentSchema.methods.getTotalRepliesCount = async function() {
  return await this.constructor.countTotalRepliesRecursive(this._id);
};

// Pre-save middleware
discussionCommentSchema.pre('save', function(next) {
  if (this.isNew) {
    this.wasNew = true;
  }
  
  if (this.isModified('likes')) {
    this.likesCount = this.likes.length;
  }
  
  if (this.isModified('content') && !this.isNew) {
    this.isEdited = true;
    this.editedAt = new Date();
  }
  
  next();
});

// Post-save middleware - update parent and discussion
discussionCommentSchema.post('save', async function(doc) {
  try {
    // Add to parent comment's replies
    if (doc.parentComment && doc.wasNew === false) {
      const parentComment = await this.constructor.findById(doc.parentComment);
      if (parentComment) {
        await parentComment.addReply(doc._id);
      }
    }
    
    // Update discussion commentsCount
    if (doc.wasNew === undefined || doc.wasNew === true) {
      const stats = await this.constructor.getDiscussionCommentStats(doc.discussion);
      await Discussion.findByIdAndUpdate(
        doc.discussion,
        { 
          $set: { 
            commentsCount: stats.totalComments,
            'stats.totalComments': stats.totalComments
          } 
        },
        { new: false }
      );
      
      doc.wasNew = false;
    }
  } catch (error) {
    console.error("Error in post-save middleware:", error);
  }
});

// Pre-delete middleware - cleanup
discussionCommentSchema.pre('findOneAndDelete', async function(next) {
  try {
    const doc = await this.model.findOne(this.getFilter());
    if (!doc) return next();

    // Recursive delete function
    const deleteRepliesRecursive = async (commentId) => {
      const replies = await this.model.find({ 
        parentComment: commentId,
        status: 'active'
      });
      
      for (const reply of replies) {
        await deleteRepliesRecursive(reply._id);
        await this.model.findByIdAndDelete(reply._id);
      }
    };

    // Count total to delete
    const countRepliesRecursive = async (commentId) => {
      const replies = await this.model.find({ 
        parentComment: commentId,
        status: 'active'
      });
      
      let count = replies.length;
      for (const reply of replies) {
        count += await countRepliesRecursive(reply._id);
      }
      return count;
    };

    const totalDeleted = 1 + await countRepliesRecursive(doc._id);

    // Delete all nested replies
    await deleteRepliesRecursive(doc._id);

    // Remove from parent's replies array
    if (doc.parentComment) {
      const parentComment = await this.model.findById(doc.parentComment);
      if (parentComment) {
        await parentComment.removeReply(doc._id);
      }
    }
    
    // Update discussion commentsCount
    await Discussion.findByIdAndUpdate(
      doc.discussion,
      { 
        $inc: { 
          commentsCount: -totalDeleted,
          'stats.totalComments': -totalDeleted
        } 
      }
    );
    
    next();
  } catch (error) {
    next(error);
  }
});

const DiscussionComment = mongoose.model('DiscussionComment', discussionCommentSchema);

export default DiscussionComment;