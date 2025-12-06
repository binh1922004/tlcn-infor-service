import solutionModel from '../models/solution.models.js';
import problemModel from '../models/problem.models.js';
import response from '../helpers/response.js';

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

    // Build query
    const query = {
      problemShortId,
      status: 'published'
    };

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
      case 'newest':
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
    if (req.user) {
      const userId = req.user._id.toString();
      solutions.forEach(solution => {
        solution.userVote = null;
        if (solution.votes.upvotes.some(id => id.toString() === userId)) {
          solution.userVote = 'upvote';
        } else if (solution.votes.downvotes.some(id => id.toString() === userId)) {
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
      .populate('comments.user', 'userName fullName avatar')
      .populate('comments.replies.user', 'userName fullName avatar');

    if (!solution) {
      return response.sendError(res, 'Không tìm thấy solution', 404);
    }

    // Check if user can view
    if (solution.status !== 'published' && 
        (!req.user || (req.user._id.toString() !== solution.author._id.toString() && req.user.role !== 'admin'))) {
      return response.sendError(res, 'Không có quyền xem solution này', 403);
    }

    // Increment view count (only if not author)
    if (!req.user || req.user._id.toString() !== solution.author._id.toString()) {
      await solution.incrementView();
    }

    // Add user vote status
    if (req.user) {
      const userId = req.user._id.toString();
      solution.userVote = null;
      if (solution.votes.upvotes.some(id => id.toString() === userId)) {
        solution.userVote = 'upvote';
      } else if (solution.votes.downvotes.some(id => id.toString() === userId)) {
        solution.userVote = 'downvote';
      }
    }

    return response.sendSuccess(res, solution);
  } catch (error) {
    console.error('❌ Get solution error:', error);
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
    const userRole = req.user.role;
    const { title, content, codeBlocks, complexity, approach, tags } = req.body;

    const solution = await solutionModel.findById(id);
    if (!solution) {
      return response.sendError(res, 'Không tìm thấy solution', 404);
    }

    // Check permission
    if (solution.author.toString() !== userId.toString() && userRole !== 'admin') {
      return response.sendError(res, 'Không có quyền chỉnh sửa', 403);
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

    // Check permission
    if (solution.author.toString() !== userId.toString() && userRole !== 'admin') {
      return response.sendError(res, 'Không có quyền xóa', 403);
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

    const solution = await solutionModel.findById(id);
    if (!solution) {
      return response.sendError(res, 'Không tìm thấy solution', 404);
    }

    if (voteType === 'upvote') {
      await solution.upvote(userId);
    } else if (voteType === 'downvote') {
      await solution.downvote(userId);
    } else {
      return response.sendError(res, 'Invalid vote type', 400);
    }

    return response.sendSuccess(res, {
      upvoteCount: solution.upvoteCount,
      downvoteCount: solution.downvoteCount,
      voteScore: solution.voteScore
    });
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

export default {
  createSolution,
  getProblemSolutions,
  getSolutionById,
  updateSolution,
  deleteSolution,
  voteSolution,
  addComment,
  updateComment,
  deleteComment,
  voteComment,
  addReply,
  moderateSolution,
  getAllSolutions
};