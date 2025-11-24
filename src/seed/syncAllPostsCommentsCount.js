import mongoose from 'mongoose';
import Post from '../models/post.model.js';
import Comment from '../models/comment.model.js';

const syncAllPostsCommentsCount = async () => {
  try {
    console.log('Starting to sync commentsCount for all posts...');
    
    const posts = await Post.find().select('_id title').lean();
    
    let updated = 0;
    for (const post of posts) {
      const stats = await Comment.getPostCommentStats(post._id);
      
      await Post.findByIdAndUpdate(
        post._id,
        { $set: { commentsCount: stats.totalComments } }
      );
      
      console.log(`Updated post "${post.title}" - commentsCount: ${stats.totalComments}`);
      updated++;
    }

    console.log(`✅ Successfully synced commentsCount for ${updated} posts`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error syncing commentsCount:', error);
    process.exit(1);
  }
};

// Connect to MongoDB and run
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://binh1920042018:Binh0909@inforservice.nvonskd.mongodb.net/')
  .then(() => {
    console.log('Connected to MongoDB');
    return syncAllPostsCommentsCount();
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });