import mongoose from 'mongoose';
import crypto from 'crypto';
const classroomSchema = new mongoose.Schema({
  // Mã lớp học (dùng cho join class) - Format: PREFIX-YY-XXXX
  classCode: {
    type: String,
    unique: true,
    required: true,
    uppercase: true,
    trim: true,
    index: true
  },

  // Mã mời (6 ký tự ngẫu nhiên) - Dùng cho link mời nhanh
  inviteCode: {
    type: String,
    unique: true,
    required: true,
    uppercase: true,
    trim: true,
    length: 6,
    index: true
  },

  // Tên lớp học
  className: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },

  // Mô tả lớp học
  description: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: ''
  },

  // Người tạo/quản lý lớp (teacher hoặc admin)
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Danh sách giáo viên phụ (nếu có)
  teachers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // Danh sách học sinh
  students: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'removed'],
      default: 'active'
    }
  }],

  // Danh sách bài tập trong lớp - SỬ DỤNG shortId
  problems: [{
    problemShortId: {
      type: String,
      required: true,
      index: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    },
    dueDate: {
      type: Date,
      default: null
    },
    maxScore: {
      type: Number,
      default: 100
    },
    isRequired: {
      type: Boolean,
      default: false
    },
    order: {
      type: Number,
      default: 0
    }
  }],

  // ===== THÊM MỚI: Invite Tokens cho email invitations =====
  inviteTokens: [{
    token: {
      type: String,
      required: true,
      index: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    status: {
      type: String,
      enum: ['pending', 'used', 'expired', 'cancelled'],
      default: 'pending',
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    usedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },
    usedAt: {
      type: Date,
      default: null
    }
  }],

  // Cấu hình lớp học
  settings: {
    // Cho phép học sinh tự join bằng mã
    allowSelfEnroll: {
      type: Boolean,
      default: true
    },
    // Cho phép học sinh xem điểm của nhau
    showLeaderboard: {
      type: Boolean,
      default: true
    },
    // Cho phép học sinh thảo luận
    allowDiscussion: {
      type: Boolean,
      default: true
    },
    // Thời gian bắt đầu
    startDate: {
      type: Date,
      default: null
    },
    // Thời gian kết thúc
    endDate: {
      type: Date,
      default: null
    }
  },

  // Trạng thái lớp học
  status: {
    type: String,
    enum: ['active', 'archived', 'closed'],
    default: 'active',
    index: true
  },

  // Avatar/thumbnail của lớp
  thumbnail: {
    type: String,
    default: null
  },

  // Thống kê
  stats: {
    totalStudents: {
      type: Number,
      default: 0
    },
    totalProblems: {
      type: Number,
      default: 0
    },
    averageProgress: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  collection: 'classrooms'
});
classroomSchema.virtual('materialCount', {
  ref: 'Material',
  localField: '_id',
  foreignField: 'classroom',
  count: true,
  match: { status: 'active' }
});


// Indexes
classroomSchema.index({ owner: 1, status: 1 });
classroomSchema.index({ 'students.userId': 1 });
classroomSchema.index({ 'problems.problemShortId': 1 });
classroomSchema.index({ createdAt: -1 });
classroomSchema.index({ inviteCode: 1 });
classroomSchema.index({ 'inviteTokens.token': 1 }); // NEW: Index for invite tokens
classroomSchema.index({ 'inviteTokens.email': 1, 'inviteTokens.status': 1 }); // NEW: Composite index

// Virtual for student count
classroomSchema.virtual('studentCount').get(function() {
  return this.students.filter(s => s.status === 'active').length;
});

classroomSchema.virtual('problemCount').get(function() {
  return this.problems.length;
});


/**
 * Tạo invite token cho một email
 */
classroomSchema.methods.createInviteToken = function(email, createdBy, expiresInDays = 7) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  
  if (!this.inviteTokens) {
    this.inviteTokens = [];
  }
  
  this.inviteTokens.push({
    token,
    email: email.toLowerCase().trim(),
    status: 'pending',
    createdBy,
    expiresAt,
    createdAt: new Date()
  });
  
  return token;
};

/**
 * Tìm invite token hợp lệ
 */
classroomSchema.methods.findValidInviteToken = function(token) {
  if (!this.inviteTokens) return null;
  
  return this.inviteTokens.find(inv => 
    inv.token === token && 
    inv.status === 'pending' && 
    new Date() <= inv.expiresAt
  );
};

/**
 * Đánh dấu token đã được sử dụng
 */
classroomSchema.methods.markTokenAsUsed = function(token, userId) {
  const invite = this.inviteTokens?.find(inv => inv.token === token);
  
  if (invite) {
    invite.status = 'used';
    invite.usedBy = userId;
    invite.usedAt = new Date();
  }
  
  return this.save();
};

/**
 * Hủy bỏ token
 */
classroomSchema.methods.cancelInviteToken = function(token) {
  const invite = this.inviteTokens?.find(inv => inv.token === token);
  
  if (invite) {
    invite.status = 'cancelled';
  }
  
  return this.save();
};

/**
 * Xóa các token đã hết hạn
 */
classroomSchema.methods.cleanupExpiredTokens = function() {
  if (!this.inviteTokens) return this;
  
  const now = new Date();
  this.inviteTokens = this.inviteTokens.map(inv => {
    if (inv.status === 'pending' && now > inv.expiresAt) {
      inv.status = 'expired';
    }
    return inv;
  });
  
  return this.save();
};

/**
 * Lấy tất cả invite tokens đang pending
 */
classroomSchema.methods.getPendingInvites = function() {
  if (!this.inviteTokens) return [];
  
  const now = new Date();
  return this.inviteTokens.filter(inv => 
    inv.status === 'pending' && now <= inv.expiresAt
  );
};

// ===== EXISTING METHODS =====

/**
 * Tạo invite code ngẫu nhiên (6 ký tự)
 */
classroomSchema.statics.generateInviteCode = async function() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let attempts = 0;
  const maxAttempts = 20;
  
  while (attempts < maxAttempts) {
    let code = '';
    
    for (let i = 0; i < 6; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    const exists = await this.findOne({ inviteCode: code });
    if (!exists) {
      return code;
    }
    
    attempts++;
  }
  
  const timestamp = Date.now().toString(36).toUpperCase().slice(-3);
  const random = Math.random().toString(36).toUpperCase().slice(-3);
  return (timestamp + random).slice(0, 6);
};

/**
 * Tạo mã lớp học ngẫu nhiên
 */
classroomSchema.statics.generateClassCode = async function(prefix = 'CLS') {
  const year = new Date().getFullYear().toString().slice(-2);
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let attempts = 0;
  const maxAttempts = 10;
  
  prefix = prefix.toUpperCase().slice(0, 4);
  
  while (attempts < maxAttempts) {
    let randomPart = '';
    for (let i = 0; i < 4; i++) {
      randomPart += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    const code = `${prefix}-${year}-${randomPart}`;
    
    const exists = await this.findOne({ classCode: code });
    if (!exists) {
      return code;
    }
    
    attempts++;
  }
  
  const timestamp = Date.now().toString(36).toUpperCase().slice(-3);
  return `${prefix}-${year}-${timestamp}`;
};

/**
 * Tạo mã lớp học từ tên lớp
 */
classroomSchema.statics.generateClassCodeFromName = async function(className) {
  const words = className.trim().split(/\s+/);
  let prefix = '';
  
  if (words.length === 1) {
    prefix = words[0].slice(0, 4).toUpperCase();
  } else {
    prefix = words
      .slice(0, 4)
      .map(word => word[0])
      .join('')
      .toUpperCase();
  }
  
  if (prefix.length < 2) {
    prefix = 'CLS';
  }
  
  return this.generateClassCode(prefix);
};

/**
 * Tạo mã lớp học theo môn học
 */
classroomSchema.statics.generateClassCodeBySubject = async function(subject) {
  const subjectPrefixes = {
    'computer science': 'CS',
    'programming': 'PROG',
    'data structures': 'DS',
    'algorithms': 'ALG',
    'database': 'DB',
    'machine learning': 'ML',
    'artificial intelligence': 'AI',
    'lập trình': 'PROG',
    'cấu trúc dữ liệu': 'CTDL',
    'giải thuật': 'GT',
    'cơ sở dữ liệu': 'CSDL',
    'học máy': 'ML',
    'trí tuệ nhân tạo': 'AI',
  };
  
  const subjectLower = subject.toLowerCase().trim();
  const prefix = subjectPrefixes[subjectLower] || 'CLS';
  
  return this.generateClassCode(prefix);
};

/**
 * Kiểm tra user có phải là owner hoặc teacher không
 */
classroomSchema.methods.isTeacher = function(userId) {
  return this.owner.toString() === userId.toString() || 
         this.teachers.some(t => t.toString() === userId.toString());
};

/**
 * Kiểm tra user có phải là học sinh không
 */
classroomSchema.methods.isStudent = function(userId) {
  return this.students.some(s => 
    s.userId.toString() === userId.toString() && s.status === 'active'
  );
};

/**
 * Thêm học sinh vào lớp
 */
classroomSchema.methods.addStudent = function(userId) {
  const exists = this.students.some(s => s.userId.toString() === userId.toString());
  
  if (!exists) {
    this.students.push({
      userId,
      joinedAt: new Date(),
      status: 'active'
    });
    this.stats.totalStudents = this.students.filter(s => s.status === 'active').length;
  } else {
    const student = this.students.find(s => s.userId.toString() === userId.toString());
    if (student.status !== 'active') {
      student.status = 'active';
      student.joinedAt = new Date();
      this.stats.totalStudents = this.students.filter(s => s.status === 'active').length;
    }
  }
  
  return this.save();
};

/**
 * Xóa học sinh khỏi lớp
 */
classroomSchema.methods.removeStudent = function(userId) {
  const student = this.students.find(s => s.userId.toString() === userId.toString());
  
  if (student) {
    student.status = 'removed';
    this.stats.totalStudents = this.students.filter(s => s.status === 'active').length;
  }
  
  return this.save();
};

/**
 * Thêm bài tập vào lớp
 */
classroomSchema.methods.addProblem = function(problemShortId, options = {}) {
  const exists = this.problems.some(p => p.problemShortId === problemShortId);
  
  if (!exists) {
    this.problems.push({
      problemShortId,
      addedAt: new Date(),
      dueDate: options.dueDate || null,
      maxScore: options.maxScore || 100,
      isRequired: options.isRequired || false,
      order: this.problems.length
    });
    this.stats.totalProblems = this.problems.length;
  }
  
  return this.save();
};

/**
 * Xóa bài tập khỏi lớp
 */
classroomSchema.methods.removeProblem = function(problemShortId) {
  this.problems = this.problems.filter(p => p.problemShortId !== problemShortId);
  this.stats.totalProblems = this.problems.length;
  
  this.problems.forEach((p, index) => {
    p.order = index;
  });
  
  return this.save();
};

/**
 * Regenerate invite code
 */
classroomSchema.methods.regenerateInviteCode = async function() {
  this.inviteCode = await this.constructor.generateInviteCode();
  return this.save();
};

/**
 * Cập nhật thống kê lớp học
 */
classroomSchema.methods.updateStats = async function() {
  this.stats.totalStudents = this.students.filter(s => s.status === 'active').length;
  this.stats.totalProblems = this.problems.length;
  
  return this.save();
};

// Pre-save middleware
classroomSchema.pre('save', function(next) {
  this.stats.totalStudents = this.students.filter(s => s.status === 'active').length;
  this.stats.totalProblems = this.problems.length;
  next();
});

// Ensure virtual fields are serialized
classroomSchema.set('toJSON', { virtuals: true });
classroomSchema.set('toObject', { virtuals: true });

const classroomModel = mongoose.model('Classroom', classroomSchema);

export default classroomModel;