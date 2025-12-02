import mongoose from 'mongoose';

const broadcastNotificationSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: [
            'contest_announcement',
            'system_announcement',
            'maintenance_alert',
            'general_announcement'
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
        required: true,
        maxlength: 1000
    },

    relatedTo: {
        type: {
            type: String,
            enum: ['Contest', 'Post', 'System']
        },
        id: mongoose.Schema.Types.ObjectId,
        preview: mongoose.Schema.Types.Mixed
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

    // Tracking
    seenBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],

    seenCount: {
        type: Number,
        default: 0
    },

    isActive: {
        type: Boolean,
        default: true,
        index: true
    },

    expiresAt: Date

}, {
    timestamps: true
});

// Indexes
broadcastNotificationSchema.index({ type: 1, createdAt: -1 });
broadcastNotificationSchema.index({ isActive: 1, createdAt: -1 });
broadcastNotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 days

export default mongoose.model('BroadcastNotification', broadcastNotificationSchema);