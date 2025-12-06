import mongoose from "mongoose";

const commentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true
  },
  votes: {
    upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    downvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  },
  replies: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date
  }
}, {
  timestamps: true
});

const solutionSchema = new mongoose.Schema({
  problem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Problem',
    required: true,
    index: true
  },
  problemShortId: {
    type: String,
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  // Code blocks với syntax highlighting
  codeBlocks: [{
    language: {
      type: String,
      enum: ['cpp', 'python', 'java', 'javascript', 'c', 'csharp', 'go', 'rust', 'other'],
      required: true
    },
    code: {
      type: String,
      required: true
    },
    explanation: {
      type: String
    }
  }],
  // Thông tin về thuật toán
  complexity: {
    time: {
      type: String,
      default: 'O(n)' // e.g., O(n), O(log n), O(n^2)
    },
    space: {
      type: String,
      default: 'O(1)'
    }
  },
  approach: {
    type: String,
    enum: ['brute-force', 'greedy', 'dynamic-programming', 'divide-conquer', 'backtracking', 'graph', 'tree', 'sorting', 'searching', 'math', 'string', 'array', 'other'],
    required: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  // Votes system
  votes: {
    upvotes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    downvotes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  },
  // Counters for performance
  upvoteCount: {
    type: Number,
    default: 0
  },
  downvoteCount: {
    type: Number,
    default: 0
  },
  voteScore: {
    type: Number,
    default: 0 // upvoteCount - downvoteCount
  },
  // Views and engagement
  viewCount: {
    type: Number,
    default: 0
  },
  commentCount: {
    type: Number,
    default: 0
  },
  // Comments
  comments: [commentSchema],
  // Author info
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // Status và moderation
  status: {
    type: String,
    enum: ['draft', 'published', 'pending_review', 'approved', 'rejected', 'hidden'],
    default: 'published' // Admin có thể đăng trực tiếp
  },
  // Cho phép đóng góp từ community sau này
  isContribution: {
    type: Boolean,
    default: false // false = admin post, true = user contribution
  },
  // Moderation
  moderatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  moderatedAt: {
    type: Date
  },
  rejectionReason: {
    type: String
  },
  // Featured solution
  isFeatured: {
    type: Boolean,
    default: false
  },
  featuredAt: {
    type: Date
  },
  // Edit history
  isEdited: {
    type: Boolean,
    default: false
  },
  lastEditedAt: {
    type: Date
  },
  editHistory: [{
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    editedAt: {
      type: Date,
      default: Date.now
    },
    changes: {
      type: String
    }
  }],
  // Report system
  reports: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: {
      type: String,
      enum: ['spam', 'inappropriate', 'incorrect', 'duplicate', 'other']
    },
    description: {
      type: String
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  reportCount: {
    type: Number,
    default: 0
  },
  classroom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Classroom',
    default: null
  },
  contest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contest',
    default: null
  },
  contestParticipant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ContestParticipant',
    default: null
  },
  type: {
    type: String,
    enum: ['practice', 'contest', 'classroom'],
    default: 'practice'
  },
}, {
  timestamps: true,
  strict: true
});

// Indexes for better query performance
solutionSchema.index({ problem: 1, status: 1 });
solutionSchema.index({ problemShortId: 1, status: 1 });
solutionSchema.index({ author: 1, status: 1 });
solutionSchema.index({ voteScore: -1 }); // For sorting by popularity
solutionSchema.index({ createdAt: -1 }); // For sorting by newest
solutionSchema.index({ viewCount: -1 }); // For sorting by most viewed

// Virtual for net votes
solutionSchema.virtual('netVotes').get(function() {
  return this.upvoteCount - this.downvoteCount;
});

// Methods
solutionSchema.methods.upvote = function(userId) {
  const userIdStr = userId.toString();
  const upvoteIndex = this.votes.upvotes.findIndex(id => id.toString() === userIdStr);
  const downvoteIndex = this.votes.downvotes.findIndex(id => id.toString() === userIdStr);

  // Remove from downvotes if exists
  if (downvoteIndex > -1) {
    this.votes.downvotes.splice(downvoteIndex, 1);
    this.downvoteCount = Math.max(0, this.downvoteCount - 1);
  }

  // Toggle upvote
  if (upvoteIndex > -1) {
    this.votes.upvotes.splice(upvoteIndex, 1);
    this.upvoteCount = Math.max(0, this.upvoteCount - 1);
  } else {
    this.votes.upvotes.push(userId);
    this.upvoteCount += 1;
  }

  this.voteScore = this.upvoteCount - this.downvoteCount;
  return this.save();
};

solutionSchema.methods.downvote = function(userId) {
  const userIdStr = userId.toString();
  const upvoteIndex = this.votes.upvotes.findIndex(id => id.toString() === userIdStr);
  const downvoteIndex = this.votes.downvotes.findIndex(id => id.toString() === userIdStr);

  // Remove from upvotes if exists
  if (upvoteIndex > -1) {
    this.votes.upvotes.splice(upvoteIndex, 1);
    this.upvoteCount = Math.max(0, this.upvoteCount - 1);
  }

  // Toggle downvote
  if (downvoteIndex > -1) {
    this.votes.downvotes.splice(downvoteIndex, 1);
    this.downvoteCount = Math.max(0, this.downvoteCount - 1);
  } else {
    this.votes.downvotes.push(userId);
    this.downvoteCount += 1;
  }

  this.voteScore = this.upvoteCount - this.downvoteCount;
  return this.save();
};

solutionSchema.methods.incrementView = function() {
  this.viewCount += 1;
  return this.save();
};

export default mongoose.model('Solution', solutionSchema);