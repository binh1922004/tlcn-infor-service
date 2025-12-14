import mongoose from 'mongoose';

const userNotificationPreferenceSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
        index: true
    },

    // Lưu timestamp lần cuối user xem broadcast
    lastSeenBroadcastAt: {
        type: Date,
        default: () => new Date()
    },

    // Broadcast IDs đã dismiss
    dismissedBroadcasts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BroadcastNotification'
    }],

    // Settings
    preferences: {
        enableBroadcast: {
            type: Boolean,
            default: true
        },
        enableContest: {
            type: Boolean,
            default: true
        },
        enablePost: {
            type: Boolean,
            default: true
        }
    }

}, {
    timestamps: true
});

export default mongoose.model('UserNotificationPreference', userNotificationPreferenceSchema);