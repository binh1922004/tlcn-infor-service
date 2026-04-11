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
  item: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'itemModel'
  },
  itemModel: {
    type: String,
    required: true,
    enum: ['Post', 'Solution'] // Danh sách model có thể comment
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
  isHidden: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
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
   hiddenBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  votes: {
    upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    downvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  },
  voteScore: {
    type: Number,
    default: 0
  },
  hiddenAt: Date,
  hiddenReason: String,
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
commentSchema.index({ item: 1, itemModel: 1, createdAt: -1 });
commentSchema.index({ item: 1, itemModel: 1, parentComment: 1 }); // Composite index for better performance


// Virtual để check nếu user đã like comment
commentSchema.virtual('isLiked').get(function() {
  return this.likes && this.likes.length > 0;
});

// Static method để đếm comments cho một ITEM (Post/Solution)
commentSchema.statics.getItemCommentStats = async function(itemId, itemModel) {
  try {
    const countResult = await this.aggregate([
      {
        $match: { 
          item: new mongoose.Types.ObjectId(itemId),
          itemModel: itemModel || { $exists: true } 
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
    console.error("Error getting comment stats:", error);
    return { 
      totalComments: 0, 
      parentComments: 0, 
      replies: 0 
    };
  }
};

// Giữ nguyên để tương thích ngược với API cũ TRONG KHI BẠN CHƯA ĐỔI CONTROLLER
commentSchema.statics.getPostCommentStats = async function(postId) {
    return this.getItemCommentStats(postId, 'Post');
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

// Static method để đếm total comments của nhiều items
commentSchema.statics.getMultipleItemsCommentStats = async function(itemIds, itemModel) {
  try {
    const objectIds = itemIds.map(id => new mongoose.Types.ObjectId(id));
    
    const stats = await this.aggregate([
      {
        $match: { 
          item: { $in: objectIds },
          ...(itemModel ? { itemModel } : {})
        }
      },
      {
        $group: {
          _id: "$item",
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

    // Convert to object with itemId as key
    const statsMap = {};
    stats.forEach(stat => {
      statsMap[stat._id.toString()] = {
        totalComments: stat.totalComments,
        parentComments: stat.parentComments,
        replies: stat.replies
      };
    });

    itemIds.forEach(itemId => {
      if (!statsMap[itemId.toString()]) {
        statsMap[itemId.toString()] = {
          totalComments: 0,
          parentComments: 0,
          replies: 0
        };
      }
    });

    return statsMap;
  } catch (error) {
    console.error("Error getting multiple items comment stats:", error);
    return {};
  }
};

// Tương thích ngược
commentSchema.statics.getMultiplePostsCommentStats = async function(postIds) {
    return this.getMultipleItemsCommentStats(postIds, 'Post');
};

// Lọc pagination
commentSchema.statics.getItemCommentsWithPagination = async function(itemId, itemModel, page = 1, limit = 10) {
  try {
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const comments = await this.find({
      item: itemId,
      itemModel: itemModel,
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

    const stats = await this.getItemCommentStats(itemId, itemModel);

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
  // Lưu trạng thái isNew trước khi save
  if (this.isNew) {
    this.wasNew = true;
  }
  next();
});

// Post-save middleware để update parent comment replies array VÀ cập nhật commentCount của Post/Solution
commentSchema.post('save', async function(doc) {
  try {
    // Nếu có parentComment và không phải comment mới
    if (doc.parentComment && doc.wasNew === false) {
      const parentComment = await this.constructor.findById(doc.parentComment);
      if (parentComment) {
        await parentComment.addReply(doc._id);
      }
    }
    
    // Cập nhật Count cho model cha
    if (doc.wasNew === undefined || doc.wasNew === true) {
      const stats = await this.constructor.getItemCommentStats(doc.item, doc.itemModel);
      
      const TargetModel = mongoose.model(doc.itemModel);
      const counterField = doc.itemModel === 'Post' ? 'commentsCount' : 'commentCount';
      
      await TargetModel.findByIdAndUpdate(
        doc.item,
        { $set: { [counterField]: stats.totalComments } },
        { new: false } // Không cần trả về document
      );
      
      doc.wasNew = false;
    }
  } catch (error) {
    console.error("Error in post-save middleware:", error);
  }
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

    // Count total comments to be deleted (including nested)
    const countRepliesRecursive = async (commentId) => {
      const replies = await this.model.find({ parentComment: commentId });
      let count = replies.length;
      for (const reply of replies) {
        count += await countRepliesRecursive(reply._id);
      }
      return count;
    };

    const totalDeleted = 1 + await countRepliesRecursive(doc._id);

    // Delete all nested replies first
    await deleteRepliesRecursive(doc._id);

    // Remove this comment from parent's replies array
    if (doc.parentComment) {
      const parentComment = await this.model.findById(doc.parentComment);
      if (parentComment) {
        await parentComment.removeReply(doc._id);
      }
    }
    
    // Cập nhật Cound cho model cha (Post/Solution)
    if (doc.item && doc.itemModel) {
        const TargetModel = mongoose.model(doc.itemModel);
        const counterField = doc.itemModel === 'Post' ? 'commentsCount' : 'commentCount';

        await TargetModel.findByIdAndUpdate(
          doc.item,
          { $inc: { [counterField]: -totalDeleted } }
        );
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

commentSchema.methods.vote = async function(userId, voteType) {
  const userIdStr = userId.toString();
  
  // Khởi tạo nếu chưa có
  if (!this.votes) this.votes = { upvotes: [], downvotes: [] };
  
  const upvoteIndex = this.votes.upvotes.findIndex(id => id.toString() === userIdStr);
  const downvoteIndex = this.votes.downvotes.findIndex(id => id.toString() === userIdStr);

  if (voteType === 'upvote') {
    if (downvoteIndex > -1) this.votes.downvotes.splice(downvoteIndex, 1);
    if (upvoteIndex > -1) {
      this.votes.upvotes.splice(upvoteIndex, 1); // Bỏ upvote nếu bấm lại
    } else {
      this.votes.upvotes.push(userId); // Thêm upvote
    }
  } else if (voteType === 'downvote') {
    if (upvoteIndex > -1) this.votes.upvotes.splice(upvoteIndex, 1);
    if (downvoteIndex > -1) {
      this.votes.downvotes.splice(downvoteIndex, 1); // Bỏ downvote nếu bấm lại
    } else {
      this.votes.downvotes.push(userId); // Thêm downvote
    }
  }

  this.voteScore = this.votes.upvotes.length - this.votes.downvotes.length;
  await this.save();
  
  return {
    upvotes: this.votes.upvotes.length,
    downvotes: this.votes.downvotes.length,
    voteScore: this.voteScore
  };
};

const Comment = mongoose.model('Comment', commentSchema);

export default Comment;