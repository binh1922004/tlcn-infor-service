import sanitizeHtml from "sanitize-html";
import Post from "../models/post.model.js";
import response from "../helpers/response.js";
import Comment from '../models/comment.model.js';
/* Helper to sanitize htmlContent before saving/returning */
const sanitize = (html) => {
  if (!html) return html;
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "h1",
      "h2",
      "u",
    ]),
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
    },
    allowedSchemesByTag: {
      img: ["http", "https", "data"],
    },
  });
};

export const createPost = async (req, res) => {
  try {
    const {
      title,
      content,
      htmlContent,
      images = [],
      hashtags = [],
    } = req.body;
    if (!title || !content)
      return response.sendError(res, "Title and content are required", 400);

    const post = await Post.create({
      title: title.trim(),
      content: content.trim(),
      htmlContent: sanitize(htmlContent),
      author: req.user._id,
      images,
      hashtags,
    });
    // Emit socket event nếu là admin
    const io = req.app.get("io");
    if (io && req.user?.role === "admin") {
      io.emit("post:created", {
        postId: post._id,
        title: post.title,
        author: { _id: req.user._id, userName: req.user.userName },
        createdAt: post.createdAt,
      });
    }

    const populated =
      (await post
        .populate("author", "userName fullName avatar")
        .execPopulate?.()) || post;
    return response.sendSuccess(res, populated, "Post created", 201);
  } catch (err) {
    console.error("createPost error", err);
    return response.sendError(res, "Failed to create post");
  }
};

export const getPost = async (req, res) => {
  try {
    const postId = req.params.id;
    const post = await Post.findById(postId)
      .populate("author", "userName fullName avatar")
      .exec();
    if (!post) return response.sendError(res, "Post not found", 404);
    return response.sendSuccess(res, post);
  } catch (err) {
    console.error("getPost error", err);
    return response.sendError(res, "Failed to get post");
  }
};
const addLikeStatus = (posts, userId) => {
  return posts.map(post => {
    const likedUserIds = post.likes?.map(like => like.user?.toString()) || [];
    
    return {
      ...post,
      isLiked: userId ? likedUserIds.includes(userId.toString()) : false,
      likesCount: post.likesCount || 0,
      likedBy: likedUserIds, // Optional: danh sách userId đã like
      likes: undefined // Remove likes array
    };
  });
};

export const getPosts = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, parseInt(req.query.limit || "20", 10));
    const skip = (page - 1) * limit;
    const userId = req.user?._id;

    const filter = { isPublished: true };
    if (req.query.author) filter.author = req.query.author;
    if (req.query.hashtag) filter.hashtags = req.query.hashtag;
    
    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("author", "userName fullName avatar")
      .lean() 
      .exec();

    const postsWithLikeStatus = addLikeStatus(posts, userId);
    const total = await Post.countDocuments(filter);
    
    return response.sendSuccess(res, { 
      posts: postsWithLikeStatus, 
      meta: { page, limit, total } 
    });
  } catch (err) {
    console.error("getPosts error", err);
    return response.sendError(res, "Failed to list posts");
  }
};

export const getPopularPosts = async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit || "10", 10));
    const posts = await Post.find({ isPublished: true })
      .sort({ likesCount: -1, commentsCount: -1, createdAt: -1 })
      .limit(limit)
      .populate("author", "userName fullName avatar")
      .exec();
    return response.sendSuccess(res, posts);
  } catch (err) {
    console.error("getPopularPosts error", err);
    return response.sendError(res, "Failed to get popular posts");
  }
};

export const getRecentPosts = async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit || "10", 10));
    const posts = await Post.find({ isPublished: true })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("author", "userName fullName avatar")
      .exec();
    return response.sendSuccess(res, posts);
  } catch (err) {
    console.error("getRecentPosts error", err);
    return response.sendError(res, "Failed to get recent posts");
  }
};

export const updatePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const updates = {};
    if (req.body.title) updates.title = req.body.title.trim();
    if (req.body.content) updates.content = req.body.content.trim();
    if (req.body.htmlContent !== undefined)
      updates.htmlContent = sanitize(req.body.htmlContent);
    if (req.body.images) updates.images = req.body.images;
    if (req.body.hashtags) updates.hashtags = req.body.hashtags;
    if (typeof req.body.isPublished === "boolean")
      updates.isPublished = req.body.isPublished;

    const post = await Post.findOneAndUpdate(
      { _id: postId, author: req.user._id },
      { $set: updates },
      { new: true }
    )
      .populate("author", "userName fullName avatar")
      .exec();

    const io = req.app.get("io");
    if (io && post) {
      io.emit("post:updated", {
        postId: post._id,
        title: post.title,
        updatedAt: post.updatedAt,
      });
    }

    if (!post)
      return response.sendError(
        res,
        "Post not found or permission denied",
        404
      );
    return response.sendSuccess(res, post, "Post updated");
  } catch (err) {
    console.error("updatePost error", err);
    return response.sendError(res, "Failed to update post");
  }
};

export const deletePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const post = await Post.findOneAndDelete({
      _id: postId,
      author: req.user._id,
    }).exec();
    const io = req.app.get('io');
    if (io && post) {
      io.emit('post:deleted', { postId: post._id });
    }
    if (!post)
      return response.sendError(
        res,
        "Post not found or permission denied",
        404
      );

    return response.sendSuccess(res, null, "Post deleted");
  } catch (err) {
    console.error("deletePost error", err);
    return response.sendError(res, "Failed to delete post");
  }
};

/**
 * Likes/Shares/Views - use atomic updates to avoid race conditions
 */

export const toggleLike = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user._id;

    const post = await Post.findById(postId).select("likes likesCount").lean();
    if (!post) {
      return response.sendError(res, "Post not found", 404);
    }

    const hasLiked = post.likes.some(like => like.user.toString() === userId.toString());

    let updatedPost;
    let message;

    if (hasLiked) {
      await Post.updateOne(
        { _id: postId },
        { 
          $pull: { likes: { user: userId } },
          $inc: { likesCount: -1 }
        }
      ).exec();
      
      message = "Unliked";
    } else {
      await Post.updateOne(
        { _id: postId },
        { 
          $push: { likes: { user: userId } },
          $inc: { likesCount: 1 }
        }
      ).exec();
      
      message = "Liked";
    }

    updatedPost = await Post.findById(postId)
      .select("likesCount commentsCount sharesCount likes")
      .lean();

    const isLiked = updatedPost.likes.some(like => like.user.toString() === userId.toString());

    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.emit("post:counts", {
        postId,
        likesCount: updatedPost.likesCount,
        commentsCount: updatedPost.commentsCount,
        sharesCount: updatedPost.sharesCount,
      });
    }

    return response.sendSuccess(res, {
      isLiked,
      likesCount: updatedPost.likesCount,
      wasLiked: hasLiked
    }, message);
  } catch (err) {
    console.error("toggleLike error", err);
    return response.sendError(res, "Failed to toggle like");
  }
};

export const addShare = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user._id;

    const result = await Post.updateOne(
      { _id: postId, "shares.user": { $ne: userId } },
      { $push: { shares: { user: userId } }, $inc: { sharesCount: 1 } }
    ).exec();

    if (result.nModified === 0)
      return response.sendSuccess(res, null, "Already shared");

    // Emit socket event cập nhật count
    const io = req.app.get("io");
    if (io) {
      const post = await Post.findById(postId)
        .select("likesCount commentsCount sharesCount")
        .lean();
      io.emit("post:counts", {
        postId,
        likesCount: post?.likesCount ?? 0,
        commentsCount: post?.commentsCount ?? 0,
        sharesCount: post?.sharesCount ?? 0,
      });
    }

    return response.sendSuccess(res, null, "Shared");
  } catch (err) {
    console.error("addShare error", err);
    return response.sendError(res, "Failed to add share");
  }
};

export const incrementViews = async (req, res) => {
  try {
    const postId = req.params.id;
    await Post.updateOne({ _id: postId }, { $inc: { viewsCount: 1 } }).exec();
    return response.sendSuccess(res, null, "View recorded");
  } catch (err) {
    console.error("incrementViews error", err);
    return response.sendError(res, "Failed to increment view");
  }
};

/**
 * Get all posts with admin privileges (can see unpublished posts)
 */
export const getAdminPostsList = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, parseInt(req.query.limit || "10", 10));
    const skip = (page - 1) * limit;
    
    const filter = {};
    
    // Filter by status
    if (req.query.status) {
      if (req.query.status === 'published') {
        filter.isPublished = true;
      } else if (req.query.status === 'draft') {
        filter.isPublished = false;
      }
    }
    
    // Filter by author
    if (req.query.author) {
      filter.author = req.query.author;
    }
    
    // Search by title or content
    if (req.query.search) {
      filter.$or = [
        { title: { $regex: req.query.search, $options: 'i' } },
        { content: { $regex: req.query.search, $options: 'i' } }
      ];
    }
    
    // Sort
    const sortBy = req.query.sortBy || 'createdAt';
    const order = req.query.order === 'asc' ? 1 : -1;
    const sortOptions = { [sortBy]: order };

    const posts = await Post.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .populate("author", "userName fullName avatar email")
      .select('title author images hashtags likesCount commentsCount sharesCount isPublished isPinned viewsCount createdAt updatedAt')
      .lean()
      .exec();

    const total = await Post.countDocuments(filter);

    return response.sendSuccess(res, {
      posts, // ✅ Sử dụng trực tiếp, không cần map
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error("getAdminPostsList error", err);
    return response.sendError(res, "Failed to get admin posts list");
  }
};

/**
 * Get post detail with admin privileges
 */
export const getAdminPostDetail = async (req, res) => {
  try {
    const postId = req.params.id;
    const commentsPage = parseInt(req.query.commentsPage || '1', 10);
    const commentsLimit = Math.min(20, parseInt(req.query.commentsLimit || '10', 10));
    const commentsSkip = (commentsPage - 1) * commentsLimit;
    
    // Lấy thông tin post
    const post = await Post.findById(postId)
      .populate("author", "userName fullName avatar email")
      .lean()
      .exec();

    if (!post) {
      return response.sendError(res, "Post not found", 404);
    }

    // Lấy comments với pagination
    const [comments, stats] = await Promise.all([
      Comment.find({ 
        post: postId, 
        parentComment: null 
      })
        .sort({ createdAt: -1 })
        .skip(commentsSkip)
        .limit(commentsLimit)
        .populate("author", "userName fullName avatar")
        .select('content author likesCount replies createdAt updatedAt isEdited')
        .lean()
        .exec(),
      Comment.getPostCommentStats(postId)
    ]);

    // Đếm số replies cho mỗi comment
    const commentsWithRepliesCount = await Promise.all(
      comments.map(async (comment) => ({
        ...comment,
        repliesCount: comment.replies?.length || 0
      }))
    );

    // Combine data
    const postWithComments = {
      ...post,
      comments: commentsWithRepliesCount,
      commentsCount: stats.totalComments,
      topLevelCommentsCount: stats.topLevelComments,
      commentsPagination: {
        page: commentsPage,
        limit: commentsLimit,
        total: stats.topLevelComments,
        totalPages: Math.ceil(stats.topLevelComments / commentsLimit)
      }
    };

    return response.sendSuccess(res, postWithComments);
  } catch (err) {
    console.error("getAdminPostDetail error", err);
    return response.sendError(res, "Failed to get post detail");
  }
};


/**
 * Delete post (Admin - can delete any post)
 */
export const deleteAdminPost = async (req, res) => {
  try {
    const postId = req.params.id;
    
    const post = await Post.findByIdAndDelete(postId).exec();
    
    if (!post) {
      return response.sendError(res, "Post not found", 404);
    }

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('post:deleted', { postId: post._id });
    }

    return response.sendSuccess(res, null, "Post deleted successfully");
  } catch (err) {
    console.error("deleteAdminPost error", err);
    return response.sendError(res, "Failed to delete post");
  }
};

/**
 * Update post status (Admin)
 */
export const updateAdminPostStatus = async (req, res) => {
  try {
    const postId = req.params.id;
    const { status } = req.body;

    if (!status || !['published', 'draft'].includes(status)) {
      return response.sendError(res, "Invalid status. Use 'published' or 'draft'", 400);
    }

    const isPublished = status === 'published';

    const post = await Post.findByIdAndUpdate(
      postId,
      { $set: { isPublished } },
      { new: true }
    )
      .populate("author", "userName fullName avatar")
      .exec();

    if (!post) {
      return response.sendError(res, "Post not found", 404);
    }

    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.emit("post:statusUpdated", {
        postId: post._id,
        status,
        isPublished,
        updatedAt: post.updatedAt,
      });
    }

    return response.sendSuccess(
      res,
      post,
      `Post ${status === 'published' ? 'published' : 'set to draft'} successfully`
    );
  } catch (err) {
    console.error("updateAdminPostStatus error", err);
    return response.sendError(res, "Failed to update post status");
  }
};

/**
 * Get post statistics (Admin)
 */
export const getAdminPostStats = async (req, res) => {
  try {
    const [
      totalPosts,
      publishedPosts,
      draftPosts,
      totalViews,
      totalLikes,
      totalComments,
      totalShares,
      recentPosts,
      popularPosts
    ] = await Promise.all([
      Post.countDocuments(),
      Post.countDocuments({ isPublished: true }),
      Post.countDocuments({ isPublished: false }),
      Post.aggregate([
        { $group: { _id: null, total: { $sum: "$viewsCount" } } }
      ]),
      Post.aggregate([
        { $group: { _id: null, total: { $sum: "$likesCount" } } }
      ]),
      Post.aggregate([
        { $group: { _id: null, total: { $sum: "$commentsCount" } } }
      ]),
      Post.aggregate([
        { $group: { _id: null, total: { $sum: "$sharesCount" } } }
      ]),
      Post.find({ isPublished: true })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title author createdAt')
        .populate('author', 'userName')
        .lean(),
      Post.find({ isPublished: true })
        .sort({ likesCount: -1, viewsCount: -1 })
        .limit(5)
        .select('title likesCount viewsCount author')
        .populate('author', 'userName')
        .lean()
    ]);

    const stats = {
      totalPosts,
      publishedPosts,
      draftPosts,
      totalViews: totalViews[0]?.total || 0,
      totalLikes: totalLikes[0]?.total || 0,
      totalComments: totalComments[0]?.total || 0,
      totalShares: totalShares[0]?.total || 0,
      recentPosts,
      popularPosts
    };

    return response.sendSuccess(res, stats);
  } catch (err) {
    console.error("getAdminPostStats error", err);
    return response.sendError(res, "Failed to get post statistics");
  }
};

/**
 * Bulk update posts status (Admin)
 */
export const bulkUpdatePostsStatus = async (req, res) => {
  try {
    const { postIds, status } = req.body;

    if (!postIds || !Array.isArray(postIds) || postIds.length === 0) {
      return response.sendError(res, "Post IDs array is required", 400);
    }

    if (!status || !['published', 'draft'].includes(status)) {
      return response.sendError(res, "Invalid status. Use 'published' or 'draft'", 400);
    }

    const isPublished = status === 'published';

    const result = await Post.updateMany(
      { _id: { $in: postIds } },
      { $set: { isPublished } }
    ).exec();

    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.emit("posts:bulkStatusUpdated", {
        postIds,
        status,
        count: result.nModified
      });
    }

    return response.sendSuccess(
      res,
      { updated: result.nModified },
      `${result.nModified} posts ${status === 'published' ? 'published' : 'set to draft'} successfully`
    );
  } catch (err) {
    console.error("bulkUpdatePostsStatus error", err);
    return response.sendError(res, "Failed to bulk update posts status");
  }
};

/**
 * Bulk delete posts (Admin)
 */
export const bulkDeletePosts = async (req, res) => {
  try {
    const { postIds } = req.body;

    if (!postIds || !Array.isArray(postIds) || postIds.length === 0) {
      return response.sendError(res, "Post IDs array is required", 400);
    }

    const result = await Post.deleteMany({ _id: { $in: postIds } }).exec();

    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.emit("posts:bulkDeleted", {
        postIds,
        count: result.deletedCount
      });
    }

    return response.sendSuccess(
      res,
      { deleted: result.deletedCount },
      `${result.deletedCount} posts deleted successfully`
    );
  } catch (err) {
    console.error("bulkDeletePosts error", err);
    return response.sendError(res, "Failed to bulk delete posts");
  }
};

/**
 * Pin/Unpin post (Admin)
 */
export const togglePinPost = async (req, res) => {
  try {
    const postId = req.params.id;
    
    const post = await Post.findById(postId).exec();
    
    if (!post) {
      return response.sendError(res, "Post not found", 404);
    }

    post.isPinned = !post.isPinned;
    await post.save();

    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.emit("post:pinToggled", {
        postId: post._id,
        isPinned: post.isPinned
      });
    }

    return response.sendSuccess(
      res,
      { isPinned: post.isPinned },
      `Post ${post.isPinned ? 'pinned' : 'unpinned'} successfully`
    );
  } catch (err) {
    console.error("togglePinPost error", err);
    return response.sendError(res, "Failed to toggle pin post");
  }
};