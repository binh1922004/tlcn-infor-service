import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true
  },
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null
  },
  replies: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
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
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
commentSchema.index({ post: 1, createdAt: -1 });
commentSchema.index({ author: 1 });
commentSchema.index({ parentComment: 1 });
commentSchema.index({ post: 1, parentComment: 1 }); // Composite index for better performance



// Virtual để check nếu user đã like comment
commentSchema.virtual('isLiked').get(function() {
  return this.likes && this.likes.length > 0;
});

// Static method để đếm comments cho một post
commentSchema.statics.getPostCommentStats = async function(postId) {
  try {
    const countResult = await this.aggregate([
      {
        $match: { post: new mongoose.Types.ObjectId(postId) }
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
    console.error("Error getting comment stats:", error);
    return { 
      totalComments: 0, 
      parentComments: 0, 
      replies: 0 
    };
  }
};

// Static method để đếm replies cho một comment
commentSchema.statics.getCommentRepliesCount = async function(commentId) {
  try {
    const count = await this.countDocuments({
      parentComment: new mongoose.Types.ObjectId(commentId)
    });
    return count;
  } catch (error) {
    console.error("Error getting replies count:", error);
    return 0;
  }
};
commentSchema.statics.countTotalRepliesRecursive = async function(commentId) {
  // Get direct children
  const directReplies = await this.find({ 
    parentComment: new mongoose.Types.ObjectId(commentId) 
  }).select('_id');
  
  if (directReplies.length === 0) return 0;
  
  let total = directReplies.length;
  
  // Recursively count nested replies
  for (const reply of directReplies) {
    const nestedCount = await this.countTotalRepliesRecursive(reply._id);
    total += nestedCount;
  }
  
  return total;
};
commentSchema.methods.getTotalRepliesCount = async function() {
  return await this.constructor.countTotalRepliesRecursive(this._id);
};

// Static method để đếm total comments của nhiều posts cùng lúc
commentSchema.statics.getMultiplePostsCommentStats = async function(postIds) {
  try {
    const objectIds = postIds.map(id => new mongoose.Types.ObjectId(id));
    
    const stats = await this.aggregate([
      {
        $match: { 
          post: { $in: objectIds }
        }
      },
      {
        $group: {
          _id: "$post",
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

    // Convert to object with postId as key
    const statsMap = {};
    stats.forEach(stat => {
      statsMap[stat._id.toString()] = {
        totalComments: stat.totalComments,
        parentComments: stat.parentComments,
        replies: stat.replies
      };
    });

    // Fill in zeros for posts with no comments
    postIds.forEach(postId => {
      if (!statsMap[postId.toString()]) {
        statsMap[postId.toString()] = {
          totalComments: 0,
          parentComments: 0,
          replies: 0
        };
      }
    });

    return statsMap;
  } catch (error) {
    console.error("Error getting multiple posts comment stats:", error);
    return {};
  }
};

// Static method để lấy comments có pagination và populated data
commentSchema.statics.getPostCommentsWithPagination = async function(postId, page = 1, limit = 10) {
  try {
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const comments = await this.find({
      post: postId,
      parentComment: null,
    })
      .populate("author", "userName fullName avatar")
      .populate({
        path: "replies",
        populate: {
          path: "author",
          select: "userName fullName avatar",
        },
        options: { sort: { createdAt: 1 } },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const stats = await this.getPostCommentStats(postId);

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

// Static method để check user đã like comment chưa
commentSchema.statics.checkUserLikedComments = async function(commentIds, userId) {
  try {
    const comments = await this.find({
      _id: { $in: commentIds },
      'likes.user': userId
    }).select('_id');
    
    return comments.map(comment => comment._id.toString());
  } catch (error) {
    console.error("Error checking user liked comments:", error);
    return [];
  }
};

// Instance method để đếm replies của comment hiện tại
commentSchema.methods.getRepliesCount = async function() {
  try {
    const count = await this.constructor.countDocuments({
      parentComment: this._id
    });
    return count;
  } catch (error) {
    console.error("Error getting replies count:", error);
    return 0;
  }
};

// Instance method để check user đã like comment này chưa
commentSchema.methods.isLikedByUser = function(userId) {
  if (!this.likes || this.likes.length === 0 || !userId) {

    return false;
  }
  
  const result = this.likes.some(like => {
    let likeUserId;
    
    if (typeof like === 'string') {
      likeUserId = like;
    } else if (like && typeof like === 'object') {
      likeUserId = like.user || like._id;
    }
    
    const match = likeUserId && likeUserId.toString() === userId.toString();
    
    return match;
  });
  
  return result;
};

// Instance method để toggle like
commentSchema.methods.toggleLike = async function(userId) {
  try {
    const isLiked = this.isLikedByUser(userId);
    
    if (isLiked) {
      // Remove like
      this.likes = this.likes.filter(like => like.user.toString() !== userId.toString());
    } else {
      // Add like
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

//Instance method để add reply
commentSchema.methods.addReply = async function(replyId) {
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

// Instance method để remove reply
commentSchema.methods.removeReply = async function(replyId) {
  try {
    this.replies = this.replies.filter(reply => reply.toString() !== replyId.toString());
    await this.save();
    return this;
  } catch (error) {
    console.error("Error removing reply:", error);
    throw error;
  }
};

// Pre-save middleware
commentSchema.pre('save', function(next) {
  if (this.isModified('likes')) {
    this.likesCount = this.likes.length;
  }
  if (this.isModified('content') && !this.isNew) {
    this.isEdited = true;
    this.editedAt = new Date();
  }
  next();
});

// Post-save middleware để update parent comment replies array
commentSchema.post('save', async function(doc) {
  if (doc.parentComment && !doc.wasNew) {
    try {
      const parentComment = await this.constructor.findById(doc.parentComment);
      if (parentComment) {
        await parentComment.addReply(doc._id);
      }
    } catch (error) {
      console.error("Error updating parent comment replies:", error);
    }
  }
  doc.wasNew = false;
});

// Pre-remove middleware để cleanup references
commentSchema.pre('findOneAndDelete', async function(next) {
  try {
    const doc = await this.model.findOne(this.getFilter());
    if (!doc) return next();

    // Recursive function to delete all nested replies
    const deleteRepliesRecursive = async (commentId) => {
      const replies = await this.model.find({ parentComment: commentId });
      for (const reply of replies) {
        await deleteRepliesRecursive(reply._id);
        await this.model.findByIdAndDelete(reply._id);
      }
    };

    // Delete all nested replies first
    await deleteRepliesRecursive(doc._id);

    // Remove this comment from parent's replies array
    if (doc.parentComment) {
      const parentComment = await this.model.findById(doc.parentComment);
      if (parentComment) {
        await parentComment.removeReply(doc._id);
      }
    }
    
    next();
  } catch (error) {
    next(error);
  }
});


const Comment = mongoose.model('Comment', commentSchema);

export default Comment;