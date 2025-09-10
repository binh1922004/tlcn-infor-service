import sanitizeHtml from "sanitize-html";
import Post from "../models/post.model.js";
import response from "../helpers/response.js";

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

export const getPosts = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, parseInt(req.query.limit || "20", 10));
    const skip = (page - 1) * limit;

    const filter = { isPublished: true };
    if (req.query.author) filter.author = req.query.author;
    if (req.query.hashtag) filter.hashtags = req.query.hashtag;

    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("author", "userName fullName avatar")
      .exec();

    const total = await Post.countDocuments(filter);
    return response.sendSuccess(res, { posts, meta: { page, limit, total } });
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
export const addLike = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user._id;

    const result = await Post.updateOne(
      { _id: postId, "likes.user": { $ne: userId } },
      { $push: { likes: { user: userId } }, $inc: { likesCount: 1 } }
    ).exec();

    if (result.nModified === 0)
      return response.sendSuccess(res, null, "Already liked");

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

    return response.sendSuccess(res, null, "Liked");
  } catch (err) {
    console.error("addLike error", err);
    return response.sendError(res, "Failed to add like");
  }
};

export const removeLike = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user._id;

    await Post.updateOne(
      { _id: postId },
      { $pull: { likes: { user: userId } }, $set: { likesCount: 0 } }
    ).exec();

    // Recalculate likesCount to keep consistency
    await Post.updateOne({ _id: postId }, [
      { $set: { likesCount: { $size: "$likes" } } },
    ]).exec();

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

    return response.sendSuccess(res, null, "Unliked");
  } catch (err) {
    console.error("removeLike error", err);
    return response.sendError(res, "Failed to remove like");
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
