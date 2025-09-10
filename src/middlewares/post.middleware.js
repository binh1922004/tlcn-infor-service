import Post from '../models/post.model.js';
import sanitizeHtml from 'sanitize-html';
import response from '../helpers/response.js';

export const sanitizeRequestHtml = (req, _res, next) => {
  if (req.body && typeof req.body.htmlContent === 'string') {
    req.body.htmlContent = sanitizeHtml(req.body.htmlContent, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'u']),
      allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt'] },
      allowedSchemesByTag: { img: ['http', 'https', 'data'] }
    });
  }
  return next();
};

export const loadPost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('author', 'userName fullName avatar')
      .exec();
    if (!post) return response.sendError(res, 'Post not found', 404);
    req.post = post;
    return next();
  } catch (err) {
    console.error(err);
    return response.sendError(res, 'Failed to load post');
  }
};

export const ensureAuthor = (req, res, next) => {
  const userId = req.user && req.user._id ? req.user._id.toString() : null;
  const authorId = req.post && req.post.author ? req.post.author._id?.toString() : null;
  if (!userId || userId !== authorId) return response.sendError(res, 'Forbidden', 403);
  return next();
};