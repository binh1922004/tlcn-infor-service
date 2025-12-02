// models/Notification.js
import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    type: {
        type: String,
        enum: [
            'submission_result',
            'contest_start',
            'contest_end',
            'contest_announcement',
            'clarification_reply',
            'comment_reply',
            'problem_update',
            'rank_achievement',
            'system_announcement'
        ],
        required: true,
        index: true
    },

    priority: {
        type: String,
        enum: ['low', 'normal', 'high', 'urgent'],
        default: 'normal'
    },

    title: {
        type: String,
        required: true,
        maxlength: 255
    },

    message: {
        type: String,
        maxlength: 1000
    },

    relatedTo: {
        type: {
            type: String,
            enum: ['Submission', 'Contest', 'User', 'Post']
        },
        id: mongoose.Schema.Types.ObjectId,
        preview: mongoose.Schema.Types.Mixed // Flexible object
    },

    actor: {
        type: {
            type: String,
            enum: ['system', 'user'],
            default: 'system'
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        username: String,
        avatar: String
    },

    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    actionUrl: String,
    actionText: String,

    isRead: {
        type: Boolean,
        default: false,
        index: true
    },

    readAt: Date,

    expiresAt: Date,

    batchId: mongoose.Schema.Types.ObjectId,

    delivery: {
        web: { type: Boolean, default: true },
        email: { type: Boolean, default: false },
        push: { type: Boolean, default: false },
        emailSentAt: Date
    }

}, {
    timestamps: true // auto createdAt, updatedAt
});

// Compound indexes
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, type: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ 'relatedTo.type': 1, 'relatedTo.id': 1 });

// TTL index - auto delete old notifications
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

export default mongoose.model('Notification', notificationSchema);