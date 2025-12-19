import response from "../../helpers/response.js";
import discussionModel from "../../models/discussion.model.js";
import DiscussionComment from "../../models/discussionComment.model.js";
import classroomModel from "../../models/classroom.model.js";
import userModel from "../../models/user.models.js";
/**
 * Create new discussion/announcement
 * Route: POST /api/classroom/class/:classCode/discussions
 */
export const createDiscussion = async (req, res) => {
  try {
    const classroom = req.classroom;
    const userId = req.user._id;
    const isTeacher = req.isTeacher;
    
    const {
      title,
      content,
      type,
      priority,
      tags,
      attachments,
      relatedProblem,
      relatedContest,
      allowComments,
      scheduledFor
    } = req.body;

    if (!title || !content) {
      return response.sendError(res, 'Tiêu đề và nội dung là bắt buộc', 400);
    }

    if (type === 'announcement' && !isTeacher) {
      return response.sendError(res, 'Chỉ giáo viên mới có thể tạo thông báo', 403);
    }

    if (!isTeacher && !classroom.settings.allowDiscussion) {
      return response.sendError(res, 'Học sinh không được phép tạo thảo luận', 403);
    }

    const discussion = new discussionModel({
      classroom: classroom._id,
      author: userId,
      title,
      content,
      type: type || 'discussion',
      priority: priority || 'normal',
      tags: tags || [],
      attachments: attachments || [],
      relatedProblem: relatedProblem || null,
      relatedContest: relatedContest || null,
      allowComments: allowComments !== undefined ? allowComments : true,
      scheduledFor: scheduledFor || null,
      isPublished: scheduledFor ? false : true,
      status: 'active'
    });

    await discussion.save();
    await discussion.populate('author', 'userName fullName avatar email');

    return response.sendSuccess(res, { discussion }, 'Tạo bài viết thành công');
  } catch (error) {
    console.error('❌ Error creating discussion:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Get discussions for classroom
 * Route: GET /api/classroom/class/:classCode/discussions
 */
export const getDiscussions = async (req, res) => {
  try {
    const classroom = req.classroom;
    const userId = req.user._id;
    const isTeacher = req.isTeacher;
    
    const {
      page = 1,
      limit = 20,
      type,
      tags,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      showPinned = true
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let filter = {
      classroom: classroom._id,
      status: 'active',
      isPublished: true
    };

    if (type) {
      filter.type = type;
    }

    if (tags) {
      filter.tags = { $in: tags.split(',') };
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }

    let sortOptions = {};
    if (showPinned === 'true') {
      sortOptions.isPinned = -1;
    }
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const total = await discussionModel.countDocuments(filter);

    const discussions = await discussionModel
      .find(filter)
      .populate('author', 'userName fullName avatar email')
      .populate('pinnedBy', 'userName fullName')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const discussionsWithUserInfo = discussions.map(disc => {
      const discObj = disc.toObject();
      
      return {
        ...discObj,
        userReaction: disc.getUserReaction(userId),
        hasViewed: disc.views.some(v => v.userId.toString() === userId.toString()),
        canEdit: disc.author._id.toString() === userId.toString() || isTeacher,
        canDelete: disc.author._id.toString() === userId.toString() || isTeacher,
        canPin: isTeacher,
        canLock: isTeacher
      };
    });

    return response.sendSuccess(res, {
      discussions: discussionsWithUserInfo,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Error getting discussions:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Get discussion by ID with comments
 * Route: GET /api/classroom/class/:classCode/discussions/:discussionId
 */
export const getDiscussionById = async (req, res) => {
  try {
    const { discussionId } = req.params;
    const classroom = req.classroom;
    const userId = req.user._id;
    const isTeacher = req.isTeacher;

    const discussion = await discussionModel
      .findOne({
        _id: discussionId,
        classroom: classroom._id
      })
      .populate('author', 'userName fullName avatar email')
      .populate('pinnedBy', 'userName fullName')
      .populate('lockedBy', 'userName fullName')
      .populate('reactions.userId', 'userName fullName avatar');

    if (!discussion) {
      return response.sendError(res, 'Không tìm thấy bài viết', 404);
    }

    // Get comments
    const comments = await DiscussionComment.find({
      discussion: discussionId,
      parentComment: null,
      status: 'active'
    })
      .populate('author', 'userName fullName avatar email')
      .populate({
        path: 'replies',
        match: { status: 'active' },
        populate: {
          path: 'author',
          select: 'userName fullName avatar email'
        },
        options: { sort: { createdAt: 1 } }
      })
      .sort({ createdAt: -1 });

    // Add view
    await discussion.addView(userId);

    const discObj = discussion.toObject();

    // Add user info to comments
    const commentsWithUserInfo = comments.map(comment => {
      const commentObj = comment.toObject();
      return {
        ...commentObj,
        isLikedByCurrentUser: comment.isLikedByUser(userId),
        canEdit: comment.author._id.toString() === userId.toString() || isTeacher,
        canDelete: comment.author._id.toString() === userId.toString() || isTeacher,
        // Add same info to replies
        replies: commentObj.replies?.map(reply => ({
          ...reply,
          isLikedByCurrentUser: reply.likes?.some(l => 
            (l.user || l._id).toString() === userId.toString()
          ),
          canEdit: reply.author._id.toString() === userId.toString() || isTeacher,
          canDelete: reply.author._id.toString() === userId.toString() || isTeacher
        }))
      };
    });

    return response.sendSuccess(res, {
      discussion: {
        ...discObj,
        comments: commentsWithUserInfo,
        userReaction: discussion.getUserReaction(userId),
        hasViewed: true,
        canEdit: discussion.author._id.toString() === userId.toString() || isTeacher,
        canDelete: discussion.author._id.toString() === userId.toString() || isTeacher,
        canPin: isTeacher,
        canLock: isTeacher
      }
    });
  } catch (error) {
    console.error('❌ Error getting discussion:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Update discussion
 * Route: PUT /api/classroom/class/:classCode/discussions/:discussionId
 */
export const updateDiscussion = async (req, res) => {
  try {
    const { discussionId } = req.params;
    const classroom = req.classroom;
    const userId = req.user._id;
    const isTeacher = req.isTeacher;

    const discussion = await discussionModel.findOne({
      _id: discussionId,
      classroom: classroom._id
    });

    if (!discussion) {
      return response.sendError(res, 'Không tìm thấy bài viết', 404);
    }

    if (discussion.author.toString() !== userId.toString() && !isTeacher) {
      return response.sendError(res, 'Bạn không có quyền chỉnh sửa', 403);
    }

    const {
      title,
      content,
      type,
      priority,
      tags,
      attachments,
      allowComments
    } = req.body;

    if (title) discussion.title = title;
    if (content) discussion.content = content;
    if (type && isTeacher) discussion.type = type;
    if (priority && isTeacher) discussion.priority = priority;
    if (tags) discussion.tags = tags;
    if (attachments) discussion.attachments = attachments;
    if (allowComments !== undefined) discussion.allowComments = allowComments;

    discussion.isEdited = true;
    discussion.editedAt = new Date();

    await discussion.save();
    await discussion.populate('author', 'userName fullName avatar email');

    return response.sendSuccess(res, { discussion }, 'Cập nhật bài viết thành công');
  } catch (error) {
    console.error('❌ Error updating discussion:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Delete discussion
 * Route: DELETE /api/classroom/class/:classCode/discussions/:discussionId
 */
export const deleteDiscussion = async (req, res) => {
  try {
    const { discussionId } = req.params;
    const classroom = req.classroom;
    const userId = req.user._id;
    const isTeacher = req.isTeacher;

    const discussion = await discussionModel.findOne({
      _id: discussionId,
      classroom: classroom._id
    });

    if (!discussion) {
      return response.sendError(res, 'Không tìm thấy bài viết', 404);
    }

    if (discussion.author.toString() !== userId.toString() && !isTeacher) {
      return response.sendError(res, 'Bạn không có quyền xóa', 403);
    }

    discussion.status = 'deleted';
    await discussion.save();

    // Delete all comments associated with this discussion
    await DiscussionComment.deleteMany({ discussion: discussionId });

    return response.sendSuccess(res, null, 'Xóa bài viết thành công');
  } catch (error) {
    console.error('❌ Error deleting discussion:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Add comment to discussion
 * Route: POST /api/classroom/class/:classCode/discussions/:discussionId/comments
 */
export const addComment = async (req, res) => {
  try {
    const { discussionId } = req.params;
    const classroom = req.classroom;
    const userId = req.user._id;
    const { content, attachments } = req.body;

    if (!content || content.trim().length === 0) {
      return response.sendError(res, 'Nội dung bình luận là bắt buộc', 400);
    }

    const discussion = await discussionModel.findOne({
      _id: discussionId,
      classroom: classroom._id
    });

    if (!discussion) {
      return response.sendError(res, 'Không tìm thấy bài viết', 404);
    }

    if (discussion.isLocked) {
      return response.sendError(res, 'Bài viết đã bị khóa bình luận', 403);
    }

    if (!discussion.allowComments) {
      return response.sendError(res, 'Bài viết không cho phép bình luận', 403);
    }

    const comment = new DiscussionComment({
      discussion: discussionId,
      author: userId,
      content,
      attachments: attachments || [],
      status: 'active'
    });

    await comment.save();
    await comment.populate('author', 'userName fullName avatar email');

    return response.sendSuccess(res, { comment }, 'Thêm bình luận thành công');
  } catch (error) {
    console.error('❌ Error adding comment:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Add reply to comment
 * Route: POST /api/classroom/class/:classCode/discussions/:discussionId/comments/:commentId/replies
 */
export const addReply = async (req, res) => {
  try {
    const { discussionId, commentId } = req.params;
    const classroom = req.classroom;
    const userId = req.user._id;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return response.sendError(res, 'Nội dung reply là bắt buộc', 400);
    }

    const discussion = await discussionModel.findOne({
      _id: discussionId,
      classroom: classroom._id
    });

    if (!discussion) {
      return response.sendError(res, 'Không tìm thấy bài viết', 404);
    }

    if (discussion.isLocked) {
      return response.sendError(res, 'Bài viết đã bị khóa bình luận', 403);
    }

    const parentComment = await DiscussionComment.findOne({
      _id: commentId,
      discussion: discussionId,
      status: 'active'
    });

    if (!parentComment) {
      return response.sendError(res, 'Không tìm thấy comment', 404);
    }

    // Create reply
    const reply = new DiscussionComment({
      discussion: discussionId,
      author: userId,
      content,
      parentComment: commentId,
      status: 'active'
    });

    await reply.save();
    await reply.populate('author', 'userName fullName avatar email');

    await parentComment.addReply(reply._id);

    return response.sendSuccess(res, { reply }, 'Thêm reply thành công');
  } catch (error) {
    console.error('❌ Error adding reply:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Edit comment
 * Route: PUT /api/classroom/class/:classCode/discussions/:discussionId/comments/:commentId
 */
export const editComment = async (req, res) => {
  try {
    const { discussionId, commentId } = req.params;
    const classroom = req.classroom;
    const userId = req.user._id;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return response.sendError(res, 'Nội dung bình luận là bắt buộc', 400);
    }

    const comment = await DiscussionComment.findOne({
      _id: commentId,
      discussion: discussionId,
      status: 'active'
    });

    if (!comment) {
      return response.sendError(res, 'Không tìm thấy bình luận', 404);
    }

    if (comment.author.toString() !== userId.toString()) {
      return response.sendError(res, 'Bạn không có quyền chỉnh sửa', 403);
    }

    comment.content = content;
    comment.isEdited = true;
    comment.editedAt = new Date();

    await comment.save();
    await comment.populate('author', 'userName fullName avatar email');

    return response.sendSuccess(res, { comment }, 'Cập nhật bình luận thành công');
  } catch (error) {
    console.error('❌ Error editing comment:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Delete comment
 * Route: DELETE /api/classroom/class/:classCode/discussions/:discussionId/comments/:commentId
 */
export const deleteComment = async (req, res) => {
  try {
    const { discussionId, commentId } = req.params;
    const classroom = req.classroom;
    const userId = req.user._id;
    const isTeacher = req.isTeacher;

    const comment = await DiscussionComment.findOne({
      _id: commentId,
      discussion: discussionId
    });

    if (!comment) {
      return response.sendError(res, 'Không tìm thấy bình luận', 404);
    }

    if (comment.author.toString() !== userId.toString() && !isTeacher) {
      return response.sendError(res, 'Bạn không có quyền xóa', 403);
    }

    await DiscussionComment.findByIdAndDelete(commentId);

    return response.sendSuccess(res, null, 'Xóa bình luận thành công');
  } catch (error) {
    console.error('❌ Error deleting comment:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Toggle comment like
 * Route: POST /api/classroom/class/:classCode/discussions/:discussionId/comments/:commentId/like
 */
export const toggleCommentLike = async (req, res) => {
  try {
    const { discussionId, commentId } = req.params;
    const userId = req.user._id;

    const comment = await DiscussionComment.findOne({
      _id: commentId,
      discussion: discussionId,
      status: 'active'
    });

    if (!comment) {
      return response.sendError(res, 'Không tìm thấy bình luận', 404);
    }

    const result = await comment.toggleLike(userId);

    return response.sendSuccess(
      res, 
      result, 
      result.isLiked ? 'Đã thích bình luận' : 'Đã bỏ thích bình luận'
    );
  } catch (error) {
    console.error('❌ Error toggling comment like:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Toggle reply like
 * Route: POST /api/classroom/class/:classCode/discussions/:discussionId/comments/:commentId/replies/:replyId/like
 */
export const toggleReplyLike = async (req, res) => {
  try {
    const { discussionId, commentId, replyId } = req.params;
    const userId = req.user._id;

    const reply = await DiscussionComment.findOne({
      _id: replyId,
      discussion: discussionId,
      parentComment: commentId,
      status: 'active'
    });

    if (!reply) {
      return response.sendError(res, 'Không tìm thấy reply', 404);
    }

    const result = await reply.toggleLike(userId);

    return response.sendSuccess(
      res, 
      result, 
      result.isLiked ? 'Đã thích reply' : 'Đã bỏ thích reply'
    );
  } catch (error) {
    console.error('❌ Error toggling reply like:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Edit reply
 * Route: PUT /api/classroom/class/:classCode/discussions/:discussionId/comments/:commentId/replies/:replyId
 */
export const editReply = async (req, res) => {
  try {
    const { discussionId, commentId, replyId } = req.params;
    const userId = req.user._id;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return response.sendError(res, 'Nội dung reply là bắt buộc', 400);
    }

    const reply = await DiscussionComment.findOne({
      _id: replyId,
      discussion: discussionId,
      parentComment: commentId,
      status: 'active'
    });

    if (!reply) {
      return response.sendError(res, 'Không tìm thấy reply', 404);
    }

    if (reply.author.toString() !== userId.toString()) {
      return response.sendError(res, 'Bạn không có quyền chỉnh sửa', 403);
    }

    reply.content = content;
    reply.isEdited = true;
    reply.editedAt = new Date();

    await reply.save();
    await reply.populate('author', 'userName fullName avatar email');

    return response.sendSuccess(res, { reply }, 'Cập nhật reply thành công');
  } catch (error) {
    console.error('❌ Error editing reply:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Delete reply
 * Route: DELETE /api/classroom/class/:classCode/discussions/:discussionId/comments/:commentId/replies/:replyId
 */
export const deleteReply = async (req, res) => {
  try {
    const { discussionId, commentId, replyId } = req.params;
    const userId = req.user._id;
    const isTeacher = req.isTeacher;

    const reply = await DiscussionComment.findOne({
      _id: replyId,
      discussion: discussionId,
      parentComment: commentId
    });

    if (!reply) {
      return response.sendError(res, 'Không tìm thấy reply', 404);
    }

    if (reply.author.toString() !== userId.toString() && !isTeacher) {
      return response.sendError(res, 'Bạn không có quyền xóa', 403);
    }

    const parentComment = await DiscussionComment.findById(commentId);
    if (parentComment) {
      await parentComment.removeReply(replyId);
    }

    // Delete reply
    await DiscussionComment.findByIdAndDelete(replyId);

    return response.sendSuccess(res, null, 'Xóa reply thành công');
  } catch (error) {
    console.error('❌ Error deleting reply:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Add/Change reaction to discussion
 * Route: POST /api/classroom/class/:classCode/discussions/:discussionId/react
 */
export const addReaction = async (req, res) => {
  try {
    const { discussionId } = req.params;
    const classroom = req.classroom;
    const userId = req.user._id;
    const { type } = req.body;

    const validReactions = ['like', 'love', 'haha', 'wow', 'sad', 'angry'];
    if (!type || !validReactions.includes(type)) {
      return response.sendError(res, 'Loại reaction không hợp lệ', 400);
    }

    const discussion = await discussionModel.findOne({
      _id: discussionId,
      classroom: classroom._id
    });

    if (!discussion) {
      return response.sendError(res, 'Không tìm thấy bài viết', 404);
    }

    await discussion.addReaction(userId, type);

    return response.sendSuccess(res, {
      reactionCount: discussion.reactions.length,
      userReaction: discussion.getUserReaction(userId)
    }, 'Đã thêm reaction');
  } catch (error) {
    console.error('❌ Error adding reaction:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Remove reaction from discussion
 * Route: DELETE /api/classroom/class/:classCode/discussions/:discussionId/react
 */
export const removeReaction = async (req, res) => {
  try {
    const { discussionId } = req.params;
    const classroom = req.classroom;
    const userId = req.user._id;

    const discussion = await discussionModel.findOne({
      _id: discussionId,
      classroom: classroom._id
    });

    if (!discussion) {
      return response.sendError(res, 'Không tìm thấy bài viết', 404);
    }

    await discussion.removeReaction(userId);

    return response.sendSuccess(res, {
      reactionCount: discussion.reactions.length
    }, 'Đã xóa reaction');
  } catch (error) {
    console.error('❌ Error removing reaction:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Pin/Unpin discussion (Teacher only)
 * Route: POST /api/classroom/class/:classCode/discussions/:discussionId/pin
 */
export const togglePin = async (req, res) => {
  try {
    const { discussionId } = req.params;
    const classroom = req.classroom;
    const userId = req.user._id;

    const discussion = await discussionModel.findOne({
      _id: discussionId,
      classroom: classroom._id
    });

    if (!discussion) {
      return response.sendError(res, 'Không tìm thấy bài viết', 404);
    }

    if (discussion.isPinned) {
      await discussion.unpin();
    } else {
      await discussion.pin(userId);
    }

    return response.sendSuccess(res, {
      isPinned: discussion.isPinned
    }, discussion.isPinned ? 'Đã ghim bài viết' : 'Đã bỏ ghim bài viết');
  } catch (error) {
    console.error('❌ Error toggling pin:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Lock/Unlock discussion (Teacher only)
 * Route: POST /api/classroom/class/:classCode/discussions/:discussionId/lock
 */
export const toggleLock = async (req, res) => {
  try {
    const { discussionId } = req.params;
    const classroom = req.classroom;
    const userId = req.user._id;

    const discussion = await discussionModel.findOne({
      _id: discussionId,
      classroom: classroom._id
    });

    if (!discussion) {
      return response.sendError(res, 'Không tìm thấy bài viết', 404);
    }

    if (discussion.isLocked) {
      await discussion.unlock();
    } else {
      await discussion.lock(userId);
    }

    return response.sendSuccess(res, {
      isLocked: discussion.isLocked
    }, discussion.isLocked ? 'Đã khóa bình luận' : 'Đã mở khóa bình luận');
  } catch (error) {
    console.error('❌ Error toggling lock:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Archive discussion (Teacher only)
 * Route: POST /api/classroom/class/:classCode/discussions/:discussionId/archive
 */
export const archiveDiscussion = async (req, res) => {
  try {
    const { discussionId } = req.params;
    const classroom = req.classroom;

    const discussion = await discussionModel.findOne({
      _id: discussionId,
      classroom: classroom._id
    });

    if (!discussion) {
      return response.sendError(res, 'Không tìm thấy bài viết', 404);
    }

    await discussion.archive();

    return response.sendSuccess(res, null, 'Đã lưu trữ bài viết');
  } catch (error) {
    console.error('❌ Error archiving discussion:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

export default {
  createDiscussion,
  getDiscussions,
  getDiscussionById,
  updateDiscussion,
  deleteDiscussion,
  addComment,
  addReply,
  editComment,
  deleteComment,
  editReply,
  deleteReply,
  toggleCommentLike,
  toggleReplyLike,
  addReaction,
  removeReaction,
  togglePin,
  toggleLock,
  archiveDiscussion
};