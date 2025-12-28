import Comment from "../models/comment.model.js";
import response from "../helpers/response.js";

// Get all comments with filters (Admin)
export const getAdminComments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      status = 'all',
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query;

    // ✅ Build query - Không filter isDeleted vì field này không có trong DB
    const query = {};

    // Filter by status (isHidden)
    if (status === 'visible') {
      query.isHidden = false;
    } else if (status === 'hidden') {
      query.isHidden = true;
    }

    // Search by content
    if (search) {
      query.content = { $regex: search, $options: 'i' };
    }

   

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOrder = order === 'desc' ? -1 : 1;

    // Get comments with populated fields
    const [comments, total] = await Promise.all([
      Comment.find(query)
        .populate('author', 'userName fullName avatar email')
        .populate('post', 'title content')
        .populate('hiddenBy', 'userName fullName')
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Comment.countDocuments(query)
    ]);


    // Format response data
    const commentsWithDetails = comments.map(comment => ({
      _id: comment._id,
      content: comment.content,
      postTitle: comment.post?.title || 'Unknown Post',
      postId: comment.post?._id || comment.post || null,
      authorInfo: comment.author ? {
        _id: comment.author._id,
        userName: comment.author.userName,
        fullName: comment.author.fullName,
        avatar: comment.author.avatar,
        email: comment.author.email
      } : {
        userName: 'Unknown',
        fullName: 'Unknown User',
        avatar: null
      },
      isHidden: comment.isHidden || false,
      likesCount: comment.likesCount || 0,
      repliesCount: comment.replies?.length || 0,
      hiddenBy: comment.hiddenBy || null,
      hiddenAt: comment.hiddenAt || null,
      hiddenReason: comment.hiddenReason || null,
      parentComment: comment.parentComment || null,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      isEdited: comment.isEdited || false,
      editedAt: comment.editedAt || null
    }));

    return response.sendSuccess(
      res,
      {
        comments: commentsWithDetails,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit))
        }
      },
      'Comments retrieved successfully'
    );
  } catch (error) {
    console.error('❌ Get admin comments error:', error);
    return response.sendError(
      res,
      'Không thể lấy danh sách bình luận',
      500,
      error.message
    );
  }
};

// Get comment statistics (Admin)
export const getCommentStats = async (req, res) => {
  try {
    const [
      totalComments,
      visibleComments,
      hiddenComments,
      recentComments
    ] = await Promise.all([
      Comment.countDocuments({}),
      Comment.countDocuments({ isHidden: { $ne: true } }),
      Comment.countDocuments({ isHidden: true }),
      Comment.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      })
    ]);

    // Top posts with most comments
    const commentsByPost = await Comment.aggregate([
      {
        $group: {
          _id: '$post',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Top commenters
    const topCommenters = await Comment.aggregate([
      {
        $group: {
          _id: '$author',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          userName: '$userInfo.userName',
          fullName: '$userInfo.fullName',
          avatar: '$userInfo.avatar',
          count: 1
        }
      }
    ]);


    return response.sendSuccess(
      res,
      {
        totalComments,
        visibleComments,
        hiddenComments,
        recentComments,
        commentsByPost: commentsByPost.length,
        topCommenters
      },
      'Statistics retrieved successfully'
    );
  } catch (error) {
    console.error('❌ Get comment stats error:', error);
    return response.sendError(
      res,
      'Không thể lấy thống kê bình luận',
      500,
      error.message
    );
  }
};

// Get recent comments (Admin)
export const getRecentComments = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const comments = await Comment.find({})
      .populate('author', 'userName fullName avatar')
      .populate('post', 'title')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    // Format response
    const formattedComments = comments.map(comment => ({
      _id: comment._id,
      content: comment.content,
      postTitle: comment.post?.title || 'Unknown Post',
      author: comment.author || {
        userName: 'Unknown',
        fullName: 'Unknown User',
        avatar: null
      },
      createdAt: comment.createdAt,
      isHidden: comment.isHidden || false,
      likesCount: comment.likesCount || 0
    }));


    return response.sendSuccess(
      res,
      formattedComments,
      'Recent comments retrieved successfully'
    );
  } catch (error) {
    console.error('❌ Get recent comments error:', error);
    return response.sendError(
      res,
      'Không thể lấy bình luận gần đây',
      500,
      error.message
    );
  }
};

// Hide/Unhide comment (Admin)
export const toggleHideComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { reason } = req.body;
    const adminId = req.user._id;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return response.sendError(res, 'Không tìm thấy bình luận', 404);
    }

    comment.isHidden = !comment.isHidden;

    if (comment.isHidden) {
      comment.hiddenBy = adminId;
      comment.hiddenAt = new Date();
      comment.hiddenReason = reason || 'Vi phạm quy định';
    } else {
      comment.hiddenBy = null;
      comment.hiddenAt = null;
      comment.hiddenReason = null;
    }

    await comment.save();

    await comment.populate('author', 'userName fullName avatar');
    await comment.populate('post', 'title');


    return response.sendSuccess(
      res,
      comment,
      comment.isHidden ? 'Đã ẩn bình luận' : 'Đã hiện bình luận'
    );
  } catch (error) {
    console.error('❌ Toggle hide comment error:', error);
    return response.sendError(
      res,
      'Không thể cập nhật trạng thái bình luận',
      500,
      error.message
    );
  }
};

// Delete comment (Admin) - Soft delete bằng cách thêm flag isDeleted
export const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return response.sendError(res, 'Không tìm thấy bình luận', 404);
    }

    // ✅ Thêm field isDeleted vào document
    comment.isDeleted = true;
    await comment.save();

    // Also mark replies as deleted recursively
    const deleteRepliesRecursive = async (parentId) => {
      const replies = await Comment.find({ parentComment: parentId });
      for (const reply of replies) {
        reply.isDeleted = true;
        await reply.save();
        await deleteRepliesRecursive(reply._id);
      }
    };

    await deleteRepliesRecursive(commentId);


    return response.sendSuccess(
      res,
      null,
      'Đã xóa bình luận thành công'
    );
  } catch (error) {
    console.error('❌ Delete comment error:', error);
    return response.sendError(
      res,
      'Không thể xóa bình luận',
      500,
      error.message
    );
  }
};

// Get comment details (Admin)
export const getCommentDetail = async (req, res) => {
  try {
    const { commentId } = req.params;

    const comment = await Comment.findById(commentId)
      .populate('author', 'userName fullName avatar email')
      .populate('post', 'title content')
      .populate('hiddenBy', 'userName fullName')
      .populate({
        path: 'replies',
        populate: {
          path: 'author',
          select: 'userName fullName avatar'
        }
      })
      .lean();

    if (!comment) {
      return response.sendError(res, 'Không tìm thấy bình luận', 404);
    }

    // Get total replies count recursively
    const totalReplies = await Comment.countTotalRepliesRecursive(commentId);
    comment.totalReplies = totalReplies;

    return response.sendSuccess(
      res,
      comment,
      'Comment details retrieved successfully'
    );
  } catch (error) {
    console.error('❌ Get comment detail error:', error);
    return response.sendError(
      res,
      'Không thể lấy chi tiết bình luận',
      500,
      error.message
    );
  }
};