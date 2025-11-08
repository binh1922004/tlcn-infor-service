import Comment from "../models/comment.model.js";
import Post from "../models/post.model.js";
import response from "../helpers/response.js";

export const createComment = async (req, res) => {
  try {
    const { content, postId, parentCommentId } = req.body;
    const userId = req.user._id;
    const MAX_NESTING_LEVEL = 2;
    
    const post = await Post.findById(postId);
    if (!post) {
      return response.sendError(res, "Post Not Found", 404);
    }
    
    let actualParentCommentId = parentCommentId;
    
    if (parentCommentId) {
      const parentComment = await Comment.findById(parentCommentId);
      if (!parentComment || parentComment.post.toString() !== postId) {
        return response.sendError(
          res,
          "Không tìm thấy comment bạn reply hoặc không tồn tại trong bài đăng",
          404
        );
      }
      
      if (parentComment.parentComment) {
        const grandparentComment = await Comment.findById(parentComment.parentComment);
        if (grandparentComment && grandparentComment.parentComment === null) {
          actualParentCommentId = parentCommentId;
        } else {
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

// UPDATED: Helper function với total replies count đệ quy
const populateRepliesWithPagination = async (comments, userId, repliesLimit = 3) => {
  if (!Array.isArray(comments) || comments.length === 0) return [];
  
  const processedComments = await Promise.all(
    comments.map(async (comment) => {
      // Get total replies count recursively (including nested)
      const totalReplies = await Comment.countTotalRepliesRecursive(comment._id);
      
      // Get limited direct children only
      const directReplies = await Comment.find({
        parentComment: comment._id
      })
        .populate("author", "userName fullName avatar")
        .sort({ createdAt: 1 })
        .limit(repliesLimit)
        .lean();
      
      // Recursively populate nested replies
      const repliesWithNestedPagination = await populateRepliesWithPagination(
        directReplies, 
        userId, 
        repliesLimit
      );
      
      return {
        ...comment,
        replies: repliesWithNestedPagination,
        totalReplies, // Total count including all nested replies
        hasMoreReplies: totalReplies > directReplies.length,
        loadedRepliesCount: directReplies.length
      };
    })
  );
  
  return processedComments;
};

export const getPostComments = async (req, res) => {
  try {
    const { postId } = req.params;
    const { 
      page = 1, 
      limit = 10, 
      sortBy = 'oldest',
      repliesLimit = 3, 
      includeLikedBy = 'false'
    } = req.query;
    
    const userId = req.user?._id || null;
    const isGuest = !userId;
    const shouldIncludeLikedBy = includeLikedBy === 'true';
    
    const post = await Post.findById(postId);
    if (!post) {
      return response.sendError(res, "Post Not Found", 404);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);

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

    const comments = await Comment.find({
      post: postId,
      parentComment: null,
    })
      .populate("author", "userName fullName avatar")
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Populate replies with recursive total count
    const commentsWithPaginatedReplies = await populateRepliesWithPagination(
      comments,
      userId,
      parseInt(repliesLimit)
    );

    const commentsWithLikeStatus = addCommentLikeStatus(
      commentsWithPaginatedReplies, 
      userId
    );

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
        includeLikedBy: shouldIncludeLikedBy,
        repliesLimit: parseInt(repliesLimit) 
      }
    };
    
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

const addCommentLikeStatus = (comments, userId) => {
  if (!Array.isArray(comments)) return [];
  
  return comments.map(comment => {
    const likedUserIds = comment.likes?.map(like => 
      (like.user?._id || like.user)?.toString()
    ).filter(Boolean) || [];
    
    const processedComment = {
      ...comment,
      isLiked: userId ? likedUserIds.includes(userId.toString()) : false,
      likesCount: comment.likesCount || 0,
      likedByUserIds: likedUserIds,
      likes: undefined
    };
    
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

    if (comment.author.toString() !== userId.toString()) {
      return response.sendError(
        res,
        "You can only edit your own comments",
        403
      );
    }

    comment.content = content;
    comment.isEdited = true;
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

    if (comment.author.toString() !== userId.toString()) {
      return response.sendError(
        res,
        "You can only delete your own comments",
        403
      );
    }

    // Pre-remove middleware will handle recursive deletion of nested replies
    await Comment.findByIdAndDelete(commentId);
    
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

    const comment = await Comment.findById(commentId).lean();
    if (!comment) {
      return response.sendError(res, "Comment not found", 404);
    }

    const likedUserIds = comment.likes?.map(like => 
      (like.user?._id || like.user)?.toString()
    ).filter(Boolean) || [];
    
    const hasLiked = likedUserIds.includes(userId.toString());
    
    let updatedComment;
    let message;

    if (hasLiked) {
      await Comment.updateOne(
        { _id: commentId },
        { 
          $pull: { likes: { user: userId } },
          $inc: { likesCount: -1 }
        }
      );
      message = "Comment unliked";
    } else {
      await Comment.updateOne(
        { _id: commentId },
        { 
          $push: { likes: { user: userId } },
          $inc: { likesCount: 1 }
        }
      );
      message = "Comment liked";
    }

    updatedComment = await Comment.findById(commentId)
      .populate("author", "userName fullName avatar")
      .lean();

    const commentWithLikeStatus = addCommentLikeStatus([updatedComment], userId)[0];

    const responseData = {
      isLiked: commentWithLikeStatus.isLiked,
      likesCount: commentWithLikeStatus.likesCount,
      wasLiked: hasLiked,
      comment: commentWithLikeStatus
    };

    return response.sendSuccess(res, responseData, message);
  } catch (error) {
    console.error("Error toggling comment like:", error);
    return response.sendError(res, "Internal server error", 500, error.message);
  }
};

// UPDATED: Load more replies with recursive total count
export const loadMoreReplies = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { 
      skip = 0, 
      limit = 5,
      includeNested = 'true'
    } = req.query;
    
    const userId = req.user?._id || null;
    const shouldIncludeNested = includeNested === 'true';

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return response.sendError(res, "Comment not found", 404);
    }

    // Get total recursive count
    const totalReplies = await Comment.countTotalRepliesRecursive(commentId);

    // Get direct replies with pagination
    const replies = await Comment.find({
      parentComment: commentId,
    })
      .populate("author", "userName fullName avatar")
      .sort({ createdAt: 1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .lean();

    let processedReplies;
    if (shouldIncludeNested) {
      processedReplies = await populateRepliesWithPagination(replies, userId, 3);
    } else {
      processedReplies = replies.map(reply => ({
        ...reply,
        replies: [],
        totalReplies: 0,
        hasMoreReplies: false,
        loadedRepliesCount: 0
      }));
    }

    const repliesWithLikeStatus = addCommentLikeStatus(processedReplies, userId);

    const responseData = {
      replies: repliesWithLikeStatus,
      pagination: {
        currentSkip: parseInt(skip),
        currentLimit: parseInt(limit),
        totalReplies, // Recursive total count
        loadedCount: repliesWithLikeStatus.length,
        hasMore: (parseInt(skip) + repliesWithLikeStatus.length) < totalReplies,
        nextSkip: parseInt(skip) + parseInt(limit)
      },
      meta: {
        userId: userId ? userId.toString() : null,
        isGuest: !userId,
        includeNested: shouldIncludeNested
      }
    };

    return response.sendSuccess(
      res,
      responseData,
      "More replies loaded successfully"
    );
  } catch (error) {
    console.error("Error loading more replies:", error);
    return response.sendError(res, "Internal server error", 500, error.message);
  }
};

export const getCommentReplies = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { page = 1, limit = 5 } = req.query;
    const userId = req.user?._id || null;

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
      .lean();

    const repliesWithLikeStatus = addCommentLikeStatus(replies, userId);

    // Get recursive total count
    const totalReplies = await Comment.countTotalRepliesRecursive(commentId);

    const pagination = {
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalReplies / parseInt(limit)),
      totalReplies, // Recursive total count
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
    const userId = req.user?._id || null;

    const comment = await Comment.findById(commentId)
      .populate("author", "userName fullName avatar")
      .lean();

    if (!comment) {
      return response.sendError(res, "Comment not found", 404);
    }

    // Add total replies count
    const totalReplies = await Comment.countTotalRepliesRecursive(commentId);
    comment.totalReplies = totalReplies;

    const commentWithLikeStatus = addCommentLikeStatus([comment], userId)[0];

    return response.sendSuccess(res, commentWithLikeStatus, "Comment retrieved successfully");
  } catch (error) {
    console.error("Error getting comment:", error);
    return response.sendError(res, "Internal server error", 500, error.message);
  }
};