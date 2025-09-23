import Comment from "../models/comment.model.js";
import Post from "../models/post.model.js";
import response from "../helpers/response.js";

export const createComment = async (req, res) => {
  try {
    const { content, postId, parentCommentId } = req.body;
    const userId = req.user._id;
    const MAX_NESTING_LEVEL = 2; // Giới hạn độ sâu tối đa là 2
    
    const post = await Post.findById(postId);
    if (!post) {
      return response.sendError(res, "Post Not Found", 404);
    }
    
    // Biến để lưu ID của comment cha thực tế sẽ sử dụng
    let actualParentCommentId = parentCommentId;
    
    if (parentCommentId) {
      // Tìm comment cha được chỉ định
      const parentComment = await Comment.findById(parentCommentId);
      if (!parentComment || parentComment.post.toString() !== postId) {
        return response.sendError(
          res,
          "Không tìm thấy comment bạn reply hoặc không tồn tại trong bài đăng",
          404
        );
      }
      
      // Kiểm tra độ sâu của comment cha
      if (parentComment.parentComment) {
        // Đã là comment cấp 2 (hoặc sâu hơn)
        // Tìm comment gốc của comment cấp 2 này
        const grandparentComment = await Comment.findById(parentComment.parentComment);
        if (grandparentComment && grandparentComment.parentComment === null) {
          // Nếu grandparent là cấp 1 (có parentComment = null), sử dụng chính ID của comment cấp 2 làm parentCommentId
          // Để comment mới vẫn hiển thị ở cấp 2
          actualParentCommentId = parentCommentId;
        } else {
          // Trong trường hợp đã qua cấp 2, sử dụng ID của comment cấp 2 làm parentCommentId
          // để đảm bảo comment mới vẫn ở cấp 2
          actualParentCommentId = grandparentComment ? grandparentComment._id : parentComment.parentComment;
        }
      }
    }
    
    const comment = await Comment.create({
      content,
      author: userId,
      post: postId,
      parentComment: actualParentCommentId || null,
    });

    // Sử dụng instance method để add reply
    if (actualParentCommentId) {
      const parentComment = await Comment.findById(actualParentCommentId);
      if (parentComment) {
        await parentComment.addReply(comment._id);
      }
    }
    
    await comment.populate("author", "userName fullName avatar");
    return response.sendSuccess(
      res,
      comment,
      "comment created successfully",
      201
    );
  } catch (error) {
    console.error("Error creating comment: ", error);
    return response.sendError(res, "Internal server error", 500, error.message);
  }
};

export const getPostComments = async (req, res) => {
  try {
    const { postId } = req.params;
    const { 
      page = 1, 
      limit = 10, 
      sortBy = 'oldest',
      includeLikedBy = 'false' // Optional parameter
    } = req.query;
    
    const userId = req.user?._id || null;
    const isGuest = !userId;
    const shouldIncludeLikedBy = includeLikedBy === 'true';
    
    console.log('🔍 getPostComments Debug:', {
      postId: postId?.slice(-4),
      userId: userId ? userId.toString().slice(-4) : 'Guest',
      isGuest,
      sortBy,
      includeLikedBy: shouldIncludeLikedBy
    });
    
    const post = await Post.findById(postId);
    if (!post) {
      return response.sendError(res, "Post Not Found", 404);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Sort options
    let sortOptions = {};
    switch (sortBy.toLowerCase()) {
      case 'oldest':
        sortOptions = { createdAt: 1 };
        break;
      case 'most_liked':
        sortOptions = { likesCount: -1, createdAt: -1 };
        break;
      case 'newest':
      default:
        sortOptions = { createdAt: -1 };
        break;
    }

    console.log('🔧 Applied sort options:', sortOptions);

    // Enhanced query để include likes data
    const comments = await Comment.find({
      post: postId,
      parentComment: null,
    })
      .populate("author", "userName fullName avatar")
      .populate({
        path: "replies",
        populate: [
          {
            path: "author",
            select: "userName fullName avatar",
          },
          {
            path: "replies",
            populate: {
              path: "author",
              select: "userName fullName avatar",
            }
          }
        ],
        options: { sort: { createdAt: 1 } },
      })
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean(); // Use lean for better performance

    console.log('Raw comments found:', comments.length);

    // Apply like status using helper function
    const commentsWithLikeStatus = addCommentLikeStatus(comments, userId);

    console.log('Processed comments sample:', 
      commentsWithLikeStatus.slice(0, 2).map(c => ({
        id: c._id?.toString().slice(-4),
        content: c.content?.slice(0, 20) + '...',
        isLiked: c.isLiked,
        likesCount: c.likesCount,
        likedByCount: c.likedByUserIds?.length || 0,
        hasReplies: c.replies?.length > 0
      }))
    );

    // Get stats
    const stats = await Comment.getPostCommentStats(postId);

    const pagination = {
      currentPage: parseInt(page),
      totalPages: Math.ceil(stats.parentComments / parseInt(limit)),
      totalParentComments: stats.parentComments,
      totalComments: stats.totalComments,
      totalReplies: stats.replies,
      hasNext: page < Math.ceil(stats.parentComments / parseInt(limit)),
      hasPrev: page > 1,
    };

    const responseData = { 
      comments: commentsWithLikeStatus, 
      pagination,
      meta: {
        isGuest,
        userId: userId ? userId.toString() : null,
        sortBy: sortBy.toLowerCase(),
        appliedSort: sortOptions,
        sortedCount: commentsWithLikeStatus.length,
        includeLikedBy: shouldIncludeLikedBy
      }
    };
    
    console.log('Response meta:', responseData.meta);
    
    return response.sendSuccess(
      res,
      responseData,
      `Comments retrieved successfully, sorted by ${sortBy}`
    );
  } catch (error) {
    console.error("Error getting comments: ", error);
    return response.sendError(res, "Internal server error", 500, error.message);
  }
};
// Helper function để add like status cho comments (giống như posts)
const addCommentLikeStatus = (comments, userId) => {
  if (!Array.isArray(comments)) return [];
  
  return comments.map(comment => {
    // Extract userId array từ likes
    const likedUserIds = comment.likes?.map(like => 
      (like.user?._id || like.user)?.toString()
    ).filter(Boolean) || [];
    
    const processedComment = {
      ...comment,
      isLiked: userId ? likedUserIds.includes(userId.toString()) : false,
      likesCount: comment.likesCount || 0,
      likedByUserIds: likedUserIds, // Danh sách userId đã like
      likes: undefined // Remove raw likes array
    };
    
    // Process replies recursively
    if (processedComment.replies && processedComment.replies.length > 0) {
      processedComment.replies = addCommentLikeStatus(processedComment.replies, userId);
    }
    
    return processedComment;
  });
};

export const updateComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;
    const userId = req.user._id;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return response.sendError(res, "Comment not found", 404);
    }

    // Check if user is the author
    if (comment.author.toString() !== userId) {
      return response.sendError(
        res,
        "You can only edit your own comments",
        403
      );
    }

    comment.content = content;
    //    Pre-save middleware sẽ tự động set isEdited và editedAt
    await comment.save();

    await comment.populate("author", "userName fullName avatar");

    return response.sendSuccess(res, comment, "Comment updated successfully");
  } catch (error) {
    console.error("Error updating comment:", error);
    return response.sendError(res, "Internal server error", 500, error.message);
  }
};

export const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user._id;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return response.sendError(res, "Comment not found", 404);
    }

    // Check if user is the author
    if (comment.author.toString() !== userId) {
      return response.sendError(
        res,
        "You can only delete your own comments",
        403
      );
    }

    //    Pre-remove middleware sẽ tự động cleanup references và replies
    await comment.remove();

    return response.sendSuccess(res, null, "Comment deleted successfully");
  } catch (error) {
    console.error("Error deleting comment:", error);
    return response.sendError(res, "Internal server error", 500, error.message);
  }
};

export const toggleLikeComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user._id;

    console.log('toggleLikeComment:', {
      commentId: commentId?.slice(-4),
      userId: userId.toString().slice(-4)
    });

    const comment = await Comment.findById(commentId).lean();
    if (!comment) {
      return response.sendError(res, "Comment not found", 404);
    }

    // Check current like status
    const likedUserIds = comment.likes?.map(like => 
      (like.user?._id || like.user)?.toString()
    ).filter(Boolean) || [];
    
    const hasLiked = likedUserIds.includes(userId.toString());
    
    let updatedComment;
    let message;

    if (hasLiked) {
      // Unlike
      await Comment.updateOne(
        { _id: commentId },
        { 
          $pull: { likes: { user: userId } },
          $inc: { likesCount: -1 }
        }
      );
      message = "Comment unliked";
    } else {
      // Like
      await Comment.updateOne(
        { _id: commentId },
        { 
          $push: { likes: { user: userId } },
          $inc: { likesCount: 1 }
        }
      );
      message = "Comment liked";
    }

    // Get updated comment
    updatedComment = await Comment.findById(commentId)
      .populate("author", "userName fullName avatar")
      .lean();

    // Apply like status
    const commentWithLikeStatus = addCommentLikeStatus([updatedComment], userId)[0];

    console.log('Comment like toggled:', {
      commentId: commentId.slice(-4),
      wasLiked: hasLiked,
      nowLiked: commentWithLikeStatus.isLiked,
      likesCount: commentWithLikeStatus.likesCount
    });

    const responseData = {
      isLiked: commentWithLikeStatus.isLiked,
      likesCount: commentWithLikeStatus.likesCount,
      wasLiked: hasLiked,
      comment: commentWithLikeStatus
    };

    return response.sendSuccess(
      res,
      responseData,
      message
    );
  } catch (error) {
    console.error("Error toggling comment like:", error);
    return response.sendError(res, "Internal server error", 500, error.message);
  }
};

export const getCommentReplies = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { page = 1, limit = 5 } = req.query;
    const userId = req.user?._id || null; // Add userId

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return response.sendError(res, "Comment not found", 404);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const replies = await Comment.find({
      parentComment: commentId,
    })
      .populate("author", "userName fullName avatar")
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(); // Add lean for performance

    // Apply like status to replies
    const repliesWithLikeStatus = addCommentLikeStatus(replies, userId);

    const totalReplies = await Comment.getCommentRepliesCount(commentId);

    const pagination = {
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalReplies / parseInt(limit)),
      totalReplies,
      hasNext: page < Math.ceil(totalReplies / parseInt(limit)),
      hasPrev: page > 1,
    };

    const responseData = { 
      replies: repliesWithLikeStatus, 
      pagination,
      meta: {
        userId: userId ? userId.toString() : null,
        isGuest: !userId
      }
    };
    
    return response.sendSuccess(
      res,
      responseData,
      "Replies retrieved successfully"
    );
  } catch (error) {
    console.error("Error getting replies:", error);
    return response.sendError(res, "Internal server error", 500, error.message);
  }
};

export const getCommentById = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user?._id || null; // Add userId

    const comment = await Comment.findById(commentId)
      .populate("author", "userName fullName avatar")
      .populate({
        path: "replies",
        populate: {
          path: "author",
          select: "userName fullName avatar",
        },
        options: { sort: { createdAt: 1 } },
      })
      .lean(); // Add lean for performance

    if (!comment) {
      return response.sendError(res, "Comment not found", 404);
    }

    // Apply like status to comment and its replies
    const commentWithLikeStatus = addCommentLikeStatus([comment], userId)[0];

    return response.sendSuccess(res, commentWithLikeStatus, "Comment retrieved successfully");
  } catch (error) {
    console.error("Error getting comment:", error);
    return response.sendError(res, "Internal server error", 500, error.message);
  }
};

// // Thêm endpoint mới để lấy comment stats riêng
// export const getPostCommentStats = async (req, res) => {
//   try {
//     const { postId } = req.params;
    
//     const post = await Post.findById(postId);
//     if (!post) {
//       return response.sendError(res, "Post Not Found", 404);
//     }

//     //  Sử dụng static method từ model
//     const stats = await Comment.getPostCommentStats(postId);
    
//     return response.sendSuccess(
//       res,
//       stats,
//       "Comment stats retrieved successfully"
//     );
//   } catch (error) {
//     console.error("Error getting comment stats:", error);
//     return response.sendError(res, "Internal server error", 500, error.message);
//   }
// };

// // Thêm endpoint để lấy stats của nhiều posts
// export const getMultiplePostsCommentStats = async (req, res) => {
//   try {
//     const { postIds } = req.body; // Array of post IDs
    
//     if (!Array.isArray(postIds) || postIds.length === 0) {
//       return response.sendError(res, "postIds array is required", 400);
//     }

//     //  Sử dụng static method từ model
//     const statsMap = await Comment.getMultiplePostsCommentStats(postIds);
    
//     return response.sendSuccess(
//       res,
//       statsMap,
//       "Multiple posts comment stats retrieved successfully"
//     );
//   } catch (error) {
//     console.error("Error getting multiple posts comment stats:", error);
//     return response.sendError(res, "Internal server error", 500, error.message);
//   }
// };

// //  Thêm endpoint để check user đã like comments nào
// export const checkUserLikedComments = async (req, res) => {
//   try {
//     const { commentIds } = req.body; // Array of comment IDs
//     const userId = req.user._id;
    
//     if (!Array.isArray(commentIds) || commentIds.length === 0) {
//       return response.sendError(res, "commentIds array is required", 400);
//     }

//     //  Sử dụng static method từ model
//     const likedCommentIds = await Comment.checkUserLikedComments(commentIds, userId);
    
//     return response.sendSuccess(
//       res,
//       { likedCommentIds },
//       "User liked comments retrieved successfully"
//     );
//   } catch (error) {
//     console.error("Error checking user liked comments:", error);
//     return response.sendError(res, "Internal server error", 500, error.message);
//   }
// };

// //  Thêm endpoint để get comment với reply count
// export const getCommentWithStats = async (req, res) => {
//   try {
//     const { commentId } = req.params;
//     const userId = req.user?._id;

//     const comment = await Comment.findById(commentId)
//       .populate("author", "userName fullName avatar");

//     if (!comment) {
//       return response.sendError(res, "Comment not found", 404);
//     }

//     //  Sử dụng instance methods để get thêm thông tin
//     const repliesCount = await comment.getRepliesCount();
//     const isLiked = userId ? comment.isLikedByUser(userId) : false;

//     const responseData = {
//       ...comment.toJSON(),
//       repliesCount,
//       isLiked
//     };

//     return response.sendSuccess(
//       res,
//       responseData,
//       "Comment with stats retrieved successfully"
//     );
//   } catch (error) {
//     console.error("Error getting comment with stats:", error);
//     return response.sendError(res, "Internal server error", 500, error.message);
//   }
// };