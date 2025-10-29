import mongoose from 'mongoose';

const classroomSchema = new mongoose.Schema({
  // Mã lớp học (dùng cho join class)
  classCode: {
    type: String,
    unique: true,
    required: true,
    uppercase: true,
    trim: true,
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

// Indexes
classroomSchema.index({ owner: 1, status: 1 });
classroomSchema.index({ 'students.userId': 1 });
classroomSchema.index({ 'problems.problemShortId': 1 });
classroomSchema.index({ createdAt: -1 });

// Virtual for student count
classroomSchema.virtual('studentCount').get(function() {
  return this.students.filter(s => s.status === 'active').length;
});

classroomSchema.virtual('problemCount').get(function() {
  return this.problems.length;
});

// Methods

/**
 * Tạo mã lớp học ngẫu nhiên
 */
classroomSchema.statics.generateClassCode = function() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
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
    // Reactivate nếu đã bị remove
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
 * Thêm bài tập vào lớp - SỬ DỤNG shortId
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
 * Xóa bài tập khỏi lớp - SỬ DỤNG shortId
 */
classroomSchema.methods.removeProblem = function(problemShortId) {
  this.problems = this.problems.filter(p => p.problemShortId !== problemShortId);
  this.stats.totalProblems = this.problems.length;
  
  // Reorder
  this.problems.forEach((p, index) => {
    p.order = index;
  });
  
  return this.save();
};

/**
 * Cập nhật thống kê lớp học
 */
classroomSchema.methods.updateStats = async function() {
  this.stats.totalStudents = this.students.filter(s => s.status === 'active').length;
  this.stats.totalProblems = this.problems.length;
  
  // Tính average progress (cần implement logic tính progress)
  // this.stats.averageProgress = await calculateAverageProgress(this._id);
  
  return this.save();
};

// Pre-save middleware
classroomSchema.pre('save', function(next) {
  // Auto update stats
  this.stats.totalStudents = this.students.filter(s => s.status === 'active').length;
  this.stats.totalProblems = this.problems.length;
  next();
});

// Ensure virtual fields are serialized
classroomSchema.set('toJSON', { virtuals: true });
classroomSchema.set('toObject', { virtuals: true });

const classroomModel = mongoose.model('Classroom', classroomSchema);

export default classroomModel;