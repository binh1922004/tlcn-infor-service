import solutionModel from '../models/solution.models.js';
import problemModel from '../models/problem.models.js';
import response from '../helpers/response.js';
import User from '../models/user.models.js'; 
/**
 * Create new solution (Admin or approved users)
 */
export const createSolution = async (req, res) => {
  try {
    const { problemShortId, title, content, codeBlocks, complexity, approach, tags, classroomId, contestId } = req.body;
    const userId = req.user._id;
    const userRole = req.user.role;

    // Find problem
    const problem = await problemModel.findOne({ shortId: problemShortId }).select('classroom');
    if (!problem) {
      return response.sendError(res, 'Không tìm thấy bài tập', 404);
    }

    // Determine status based on role
    let status = 'pending_review';
    if (userRole === 'admin') {
      status = 'published';
    }

    // Xử lý classroom assignment
    let classroom = null;
    if (classroomId) {
      // User explicitly creates solution for classroom
      classroom = classroomId;
    } else if (problem.classroom) {
      // Problem belongs to classroom, auto-assign
      classroom = problem.classroom;
    }

    // Xử lý contest assignment
    let contest = null;
    let contestParticipant = null;
    let type = 'practice';

    if (contestId) {
      const latestParticipation = await getLatestContestParticipant(contestId, userId);
      
      if (!latestParticipation) {
        return response.sendError(res, 'Bạn không được phép tạo solution cho contest này', 403);
      }

      const now = new Date();
      if (
        latestParticipation.startTime &&
        now >= latestParticipation.startTime &&
        now <= latestParticipation.endTime
      ) {
        contest = contestId;
        contestParticipant = latestParticipation._id;
        type = 'contest';
      } else {
        return response.sendError(res, 'Contest đã kết thúc hoặc chưa bắt đầu', 403);
      }
    }

    // Xác định type
    if (!type || type === 'practice') {
      if (classroom) {
        type = 'classroom';
      }
    }

    const solution = await solutionModel.create({
      problem: problem._id,
      problemShortId,
      title,
      content,
      codeBlocks: codeBlocks || [],
      complexity: complexity || { time: 'O(n)', space: 'O(1)' },
      approach,
      tags: tags || [],
      author: userId,
      status,
      isContribution: userRole !== 'admin',
      classroom: classroom,
      contest: contest,
      contestParticipant: contestParticipant,
      type: type
    });

    await solution.populate('author', 'userName fullName avatar');

    return response.sendSuccess(res, solution, 'Tạo solution thành công', 201);
  } catch (error) {
    console.error('❌ Create solution error:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};
/**
 * Resubmit rejected solution for review
 */
export const resubmitSolution = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { title, content, codeBlocks, complexity, approach, tags, resubmitMessage } = req.body;

    const solution = await solutionModel.findById(id);
    if (!solution) {
      return response.sendError(res, 'Không tìm thấy solution', 404);
    }

    // CHỈ AUTHOR mới được resubmit
    if (solution.author.toString() !== userId.toString()) {
      return response.sendError(res, 'Chỉ tác giả mới có quyền gửi lại solution', 403);
    }

    // Check if solution is rejected
    if (solution.status !== 'rejected') {
      return response.sendError(res, 'Chỉ có thể resubmit solution đã bị reject', 400);
    }

    // Update solution content
    if (title) solution.title = title;
    if (content) solution.content = content;
    if (codeBlocks) solution.codeBlocks = codeBlocks;
    if (complexity) solution.complexity = complexity;
    if (approach) solution.approach = approach;
    if (tags) solution.tags = tags;

    // Update status to pending review
    solution.status = 'pending_review';
    solution.rejectionReason = null;
    solution.isEdited = true;
    solution.lastEditedAt = new Date();
    
    // Track resubmission
    solution.resubmitCount = (solution.resubmitCount || 0) + 1;
    solution.lastResubmitAt = new Date();
    solution.resubmitMessage = resubmitMessage || '';

    // Add to edit history
    solution.editHistory.push({
      editedBy: userId,
      editedAt: new Date(),
      changes: 'Resubmitted after rejection',
      resubmitMessage: resubmitMessage || ''
    });

    await solution.save();
    await solution.populate('author', 'userName fullName avatar');

    return response.sendSuccess(res, solution, 'Gửi lại solution thành công. Đang chờ admin duyệt.');
  } catch (error) {
    console.error('❌ Resubmit solution error:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Get all solutions (Admin only)
 */
export const getAllSolutions = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      search,
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query;

    const skip = (page - 1) * limit;

    // Build query
    const query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { problemShortId: { $regex: search, $options: 'i' } },
        { approach: { $regex: search, $options: 'i' } }
      ];
    }

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = order === 'desc' ? -1 : 1;

    const [solutions, total] = await Promise.all([
      solutionModel
        .find(query)
        .populate('author', 'userName fullName avatar role email')
        .populate('problem', 'name shortId')
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      solutionModel.countDocuments(query)
    ]);

    return response.sendSuccess(res, {
      items: solutions,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('❌ Get all solutions error:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};
/**
 * Get solutions for a problem
 */
export const getProblemSolutions = async (req, res) => {
  try {
    const { problemShortId } = req.params;
    const { sortBy = 'popular', page = 1, limit = 10, classroomId, excludeClassroom, contestParticipant } = req.query;

    const skip = (page - 1) * limit;
    const userId = req.user?._id;

    // Build query
    const query = {
      problemShortId
    };

    // If user is logged in, show their own solutions regardless of status
    // Otherwise, only show published solutions
    if (userId) {
      query.$or = [
        { status: 'published' },
        { author: userId } // Show user's own solutions (all statuses)
      ];
    } else {
      query.status = 'published';
    }

    // Filter by classroom
    if (classroomId) {
      query.classroom = classroomId;
    }
    
    // Exclude classroom solutions (for public/practice problems)
    if (excludeClassroom === 'true') {
      query.classroom = null;
    }

    // Filter by contestParticipant (chỉ xem solution của chính mình trong contest)
    if (contestParticipant) {
      query.contestParticipant = contestParticipant;
    }

    // Sort options
    let sort = {};
    switch (sortBy) {
      case 'popular':
        sort = { voteScore: -1, viewCount: -1 };
        break;
      case 'recent':
        sort = { createdAt: -1 };
        break;
      case 'oldest':
        sort = { createdAt: 1 };
        break;
      case 'mostViewed':
        sort = { viewCount: -1 };
        break;
      default:
        sort = { voteScore: -1 };
    }

    const [solutions, total] = await Promise.all([
      solutionModel
        .find(query)
        .populate('author', 'userName fullName avatar role')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      solutionModel.countDocuments(query)
    ]);

    // Add vote status for current user if logged in
    if (userId) {
      const userIdStr = userId.toString();
      solutions.forEach(solution => {
        solution.userVote = null;
        
        // Check if user has upvoted
        if (solution.votes?.upvotes?.some(id => id.toString() === userIdStr)) {
          solution.userVote = 'upvote';
        } 
        // Check if user has downvoted
        else if (solution.votes?.downvotes?.some(id => id.toString() === userIdStr)) {
          solution.userVote = 'downvote';
        }
      });
    }

    return response.sendSuccess(res, {
      items: solutions,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
      hasMore: skip + solutions.length < total
    });
  } catch (error) {
    console.error('❌ Get solutions error:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};



/**
 * Get solution by ID
 */
export const getSolutionById = async (req, res) => {
  try {
    const { id } = req.params;

    const solution = await solutionModel
      .findById(id)
      .populate('author', 'userName fullName avatar role')
      .select('-comments') // Exclude comments array
      .lean();

    if (!solution) {
      return response.sendError(res, 'Solution not found', 404);
    }

    // Increment view count
    await solutionModel.findByIdAndUpdate(id, { $inc: { viewCount: 1 } });
    solution.viewCount = (solution.viewCount || 0) + 1;

    // Add vote status for current user if logged in
    const userId = req.user?._id;
    if (userId) {
      const userIdStr = userId.toString();
      solution.userVote = null;
      
      if (solution.votes?.upvotes?.some(id => id.toString() === userIdStr)) {
        solution.userVote = 'upvote';
      } else if (solution.votes?.downvotes?.some(id => id.toString() === userIdStr)) {
        solution.userVote = 'downvote';
      }
    } else {
      solution.userVote = null;
    }

    // Get total comment count from the full solution (for display)
    const fullSolution = await solutionModel.findById(id).select('commentCount').lean();
    solution.totalComments = fullSolution?.commentCount || 0;

    return response.sendSuccess(res, solution);
  } catch (error) {
    console.error('❌ Get solution by ID error:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

export const getSolutionComments = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const solution = await solutionModel
      .findById(id)
      .select('comments commentCount')
      .lean();

    if (!solution) {
      return response.sendError(res, 'Solution not found', 404);
    }

    const totalComments = solution.comments?.length || 0;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const totalPages = Math.ceil(totalComments / parseInt(limit));

    // Get paginated comments
    const paginatedComments = solution.comments?.slice(skip, skip + parseInt(limit)) || [];

    // Populate user info for comments and replies
    for (let comment of paginatedComments) {
      // Populate comment user
      const commentUser = await User.findById(comment.user).select('userName fullName avatar').lean();
      comment.user = commentUser;

      // Populate reply users
      if (comment.replies && comment.replies.length > 0) {
        for (let reply of comment.replies) {
          const replyUser = await User.findById(reply.user).select('userName fullName avatar').lean();
          reply.user = replyUser;
        }
      }
    }

    return response.sendSuccess(res, {
      comments: paginatedComments,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalComments,
        hasMore: skip + paginatedComments.length < totalComments,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('❌ Get solution comments error:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Update solution
 */
export const updateSolution = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { title, content, codeBlocks, complexity, approach, tags } = req.body;

    const solution = await solutionModel.findById(id);
    if (!solution) {
      return response.sendError(res, 'Không tìm thấy solution', 404);
    }

    // CHỈ AUTHOR mới được chỉnh sửa (bỏ check admin)
    if (solution.author.toString() !== userId.toString()) {
      return response.sendError(res, 'Chỉ tác giả mới có quyền chỉnh sửa solution', 403);
    }

    // Update fields
    if (title) solution.title = title;
    if (content) solution.content = content;
    if (codeBlocks) solution.codeBlocks = codeBlocks;
    if (complexity) solution.complexity = complexity;
    if (approach) solution.approach = approach;
    if (tags) solution.tags = tags;

    solution.isEdited = true;
    solution.lastEditedAt = new Date();
    solution.editHistory.push({
      editedBy: userId,
      editedAt: new Date(),
      changes: 'Updated content'
    });

    await solution.save();
    await solution.populate('author', 'userName fullName avatar');

    return response.sendSuccess(res, solution, 'Cập nhật solution thành công');
  } catch (error) {
    console.error('❌ Update solution error:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Delete solution
 */
export const deleteSolution = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    const solution = await solutionModel.findById(id);
    if (!solution) {
      return response.sendError(res, 'Không tìm thấy solution', 404);
    }

    // Admin hoặc tác giả mới được xóa
    if (solution.author.toString() !== userId.toString() && userRole !== 'admin') {
      return response.sendError(res, 'Không có quyền xóa solution này', 403);
    }

    await solutionModel.findByIdAndDelete(id);

    return response.sendSuccess(res, null, 'Xóa solution thành công');
  } catch (error) {
    console.error('❌ Delete solution error:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Vote solution (upvote/downvote)
 */
export const voteSolution = async (req, res) => {
  try {
    const { id } = req.params;
    const { voteType } = req.body; // 'upvote' or 'downvote'
    const userId = req.user._id;

    // Validate vote type
    if (!['upvote', 'downvote'].includes(voteType)) {
      return response.sendError(res, 'Vote type phải là "upvote" hoặc "downvote"', 400);
    }

    const solution = await solutionModel.findById(id);
    if (!solution) {
      return response.sendError(res, 'Không tìm thấy solution', 404);
    }

    // Prevent voting own solution
    if (solution.author.toString() === userId.toString()) {
      return response.sendError(res, 'Không thể vote solution của chính mình', 403);
    }

    // Process vote
    if (voteType === 'upvote') {
      await solution.upvote(userId);
    } else {
      await solution.downvote(userId);
    }

    // Get updated vote status
    const userIdStr = userId.toString();
    let userVote = null;
    
    if (solution.votes.upvotes.some(id => id.toString() === userIdStr)) {
      userVote = 'upvote';
    } else if (solution.votes.downvotes.some(id => id.toString() === userIdStr)) {
      userVote = 'downvote';
    }

    return response.sendSuccess(res, {
      upvoteCount: solution.upvoteCount,
      downvoteCount: solution.downvoteCount,
      voteScore: solution.voteScore,
      userVote
    }, 'Vote thành công');
  } catch (error) {
    console.error('❌ Vote solution error:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Add comment to solution
 */
export const addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user._id;

    if (!content || content.trim().length === 0) {
      return response.sendError(res, 'Nội dung comment không được để trống', 400);
    }

    const solution = await solutionModel.findById(id);
    if (!solution) {
      return response.sendError(res, 'Không tìm thấy solution', 404);
    }

    solution.comments.push({
      user: userId,
      content: content.trim(),
      votes: { upvotes: [], downvotes: [] }
    });
    solution.commentCount += 1;

    await solution.save();
    await solution.populate('comments.user', 'userName fullName avatar');

    const newComment = solution.comments[solution.comments.length - 1];

    return response.sendSuccess(res, newComment, 'Thêm comment thành công', 201);
  } catch (error) {
    console.error('❌ Add comment error:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Update comment
 */
export const updateComment = async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const { content } = req.body;
    const userId = req.user._id;

    const solution = await solutionModel.findById(id);
    if (!solution) {
      return response.sendError(res, 'Không tìm thấy solution', 404);
    }

    const comment = solution.comments.id(commentId);
    if (!comment) {
      return response.sendError(res, 'Không tìm thấy comment', 404);
    }

    if (comment.user.toString() !== userId.toString()) {
      return response.sendError(res, 'Không có quyền chỉnh sửa comment', 403);
    }

    comment.content = content;
    comment.isEdited = true;
    comment.editedAt = new Date();

    await solution.save();

    return response.sendSuccess(res, comment, 'Cập nhật comment thành công');
  } catch (error) {
    console.error('❌ Update comment error:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Delete comment
 */
export const deleteComment = async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    const solution = await solutionModel.findById(id);
    if (!solution) {
      return response.sendError(res, 'Không tìm thấy solution', 404);
    }

    const comment = solution.comments.id(commentId);
    if (!comment) {
      return response.sendError(res, 'Không tìm thấy comment', 404);
    }

    // Check permission
    if (comment.user.toString() !== userId.toString() && userRole !== 'admin') {
      return response.sendError(res, 'Không có quyền xóa comment', 403);
    }

    comment.deleteOne();
    solution.commentCount = Math.max(0, solution.commentCount - 1);

    await solution.save();

    return response.sendSuccess(res, null, 'Xóa comment thành công');
  } catch (error) {
    console.error('❌ Delete comment error:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Vote comment
 */
export const voteComment = async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const { voteType } = req.body;
    const userId = req.user._id;

    const solution = await solutionModel.findById(id);
    if (!solution) {
      return response.sendError(res, 'Không tìm thấy solution', 404);
    }

    const comment = solution.comments.id(commentId);
    if (!comment) {
      return response.sendError(res, 'Không tìm thấy comment', 404);
    }

    const userIdStr = userId.toString();
    const upvoteIndex = comment.votes.upvotes.findIndex(id => id.toString() === userIdStr);
    const downvoteIndex = comment.votes.downvotes.findIndex(id => id.toString() === userIdStr);

    if (voteType === 'upvote') {
      // Remove from downvotes if exists
      if (downvoteIndex > -1) {
        comment.votes.downvotes.splice(downvoteIndex, 1);
      }
      // Toggle upvote
      if (upvoteIndex > -1) {
        comment.votes.upvotes.splice(upvoteIndex, 1);
      } else {
        comment.votes.upvotes.push(userId);
      }
    } else if (voteType === 'downvote') {
      // Remove from upvotes if exists
      if (upvoteIndex > -1) {
        comment.votes.upvotes.splice(upvoteIndex, 1);
      }
      // Toggle downvote
      if (downvoteIndex > -1) {
        comment.votes.downvotes.splice(downvoteIndex, 1);
      } else {
        comment.votes.downvotes.push(userId);
      }
    }

    await solution.save();

    return response.sendSuccess(res, {
      upvotes: comment.votes.upvotes.length,
      downvotes: comment.votes.downvotes.length
    });
  } catch (error) {
    console.error('❌ Vote comment error:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Add reply to comment
 */
export const addReply = async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const { content } = req.body;
    const userId = req.user._id;

    const solution = await solutionModel.findById(id);
    if (!solution) {
      return response.sendError(res, 'Không tìm thấy solution', 404);
    }

    const comment = solution.comments.id(commentId);
    if (!comment) {
      return response.sendError(res, 'Không tìm thấy comment', 404);
    }

    comment.replies.push({
      user: userId,
      content: content.trim(),
      createdAt: new Date()
    });

    await solution.save();
    await solution.populate('comments.replies.user', 'userName fullName avatar');

    const newReply = comment.replies[comment.replies.length - 1];

    return response.sendSuccess(res, newReply, 'Thêm reply thành công', 201);
  } catch (error) {
    console.error('❌ Add reply error:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};
/**
 * Check if solution exists for problem
 */
export const checkSolutionExists = async (req, res) => {
  try {
    const { problemShortId } = req.params;
    
    const solution = await solutionModel
      .findOne({ problemShortId })
      .select('_id title status author')
      .lean();
    
    return response.sendSuccess(res, {
      exists: !!solution,
      solution: solution || null
    });
  } catch (error) {
    console.error('❌ Check solution error:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

/**
 * Moderate solution (Admin only)
 */
export const moderateSolution = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reason } = req.body; // action: 'approve', 'reject', 'feature', 'hide'
    const userId = req.user._id;

    const solution = await solutionModel.findById(id);
    if (!solution) {
      return response.sendError(res, 'Không tìm thấy solution', 404);
    }

    solution.moderatedBy = userId;
    solution.moderatedAt = new Date();

    switch (action) {
      case 'approve':
        solution.status = 'published';
        break;
      case 'reject':
        solution.status = 'rejected';
        solution.rejectionReason = reason;
        break;
      case 'feature':
        solution.isFeatured = true;
        solution.featuredAt = new Date();
        break;
      case 'hide':
        solution.status = 'hidden';
        break;
      default:
        return response.sendError(res, 'Invalid action', 400);
    }

    await solution.save();

    return response.sendSuccess(res, solution, 'Moderation thành công');
  } catch (error) {
    console.error('❌ Moderate solution error:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};
export const getUserVoteStatus = async (req, res) => {
  try {
    const { solutionIds } = req.query; // comma-separated IDs
    const userId = req.user._id;

    if (!solutionIds) {
      return response.sendError(res, 'Solution IDs required', 400);
    }

    const ids = solutionIds.split(',');
    const solutions = await solutionModel
      .find({ _id: { $in: ids } })
      .select('_id votes')
      .lean();

    const voteStatus = {};
    const userIdStr = userId.toString();

    solutions.forEach(solution => {
      const solutionId = solution._id.toString();
      
      if (solution.votes.upvotes.some(id => id.toString() === userIdStr)) {
        voteStatus[solutionId] = 'upvote';
      } else if (solution.votes.downvotes.some(id => id.toString() === userIdStr)) {
        voteStatus[solutionId] = 'downvote';
      } else {
        voteStatus[solutionId] = null;
      }
    });

    return response.sendSuccess(res, voteStatus);
  } catch (error) {
    console.error('❌ Get vote status error:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};
export const removeVote = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const solution = await solutionModel.findById(id);
    if (!solution) {
      return response.sendError(res, 'Không tìm thấy solution', 404);
    }

    const userIdStr = userId.toString();
    const upvoteIndex = solution.votes.upvotes.findIndex(id => id.toString() === userIdStr);
    const downvoteIndex = solution.votes.downvotes.findIndex(id => id.toString() === userIdStr);

    let removed = false;

    // Remove from upvotes
    if (upvoteIndex > -1) {
      solution.votes.upvotes.splice(upvoteIndex, 1);
      solution.upvoteCount = Math.max(0, solution.upvoteCount - 1);
      removed = true;
    }

    // Remove from downvotes
    if (downvoteIndex > -1) {
      solution.votes.downvotes.splice(downvoteIndex, 1);
      solution.downvoteCount = Math.max(0, solution.downvoteCount - 1);
      removed = true;
    }

    if (!removed) {
      return response.sendError(res, 'Bạn chưa vote solution này', 400);
    }

    solution.voteScore = solution.upvoteCount - solution.downvoteCount;
    await solution.save();

    return response.sendSuccess(res, {
      upvoteCount: solution.upvoteCount,
      downvoteCount: solution.downvoteCount,
      voteScore: solution.voteScore,
      userVote: null
    }, 'Đã bỏ vote');
  } catch (error) {
    console.error('❌ Remove vote error:', error);
    return response.sendError(res, 'Internal server error', 500);
  }
};

export default {
  createSolution,
  getProblemSolutions,
  getSolutionById,
  getSolutionComments,
  updateSolution,
  deleteSolution,
  voteSolution,
  addComment,
  updateComment,
  deleteComment,
  voteComment,
  addReply,
  moderateSolution,
  getAllSolutions,
  checkSolutionExists,
  getUserVoteStatus,
  removeVote,
  resubmitSolution
};