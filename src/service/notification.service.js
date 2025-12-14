import notificationModel from "../models/notification.model.js";
import BroadcastNotificationModel from '../models/broadcastNotification.model.js';

const CONTEST_ANNOUNCEMENT = 'Kỳ thi mới';
const CONTEST_TYPE = 'contest_announcement';
const POST_ANNOUNCEMENT = 'Bài viết mới';
const POST_TYPE = 'system_announcement';
export const createContestNotification = (contestId, message) => {
    try {
        const notification = {
            message,
            title: CONTEST_ANNOUNCEMENT,
            relatedTo: {
                type: 'Contest',
                id: contestId,
            },
            type: CONTEST_TYPE,
        }
        notificationModel.create(notification);
        return notification;
    }
    catch (error) {
        console.error('❌ Error creating contest notification:', error);
        throw error;
    }
}
/**
 *  TẠO BROADCAST NOTIFICATION CHO CONTEST
 */
export const createContestBroadcast = async (contestId, contestData, adminData) => {
    try {
        const broadcast = {
            type: 'contest_announcement',
            priority: 'high',
            title: 'Kỳ thi mới',
            message: `Admin đã tạo kỳ thi: "${contestData.title}"`,
            relatedTo: {
                type: 'Contest',
                id: contestId,
                preview: {
                    title: contestData.title,
                    description: contestData.description?.substring(0, 150) || '',
                    startTime: contestData.startTime,
                    endTime: contestData.endTime,
                    duration: contestData.duration
                }
            },
            actor: {
                type: 'user',
                userId: adminData._id,
                username: adminData.userName,
                avatar: adminData.avatar
            },
            actionUrl: `/contest/${contestData.code}`,
            actionText: 'Xem chi tiết',
            metadata: {
                contestId: contestId,
                contestCode: contestData.code,
                startTime: contestData.startTime,
                endTime: contestData.endTime,
                isPrivate: contestData.isPrivate
            },
            isActive: true
        };

        const created = await BroadcastNotificationModel.create(broadcast);
        console.log(`✅ Created broadcast notification for contest ${contestId}`);
        
        return created;
    } catch (error) {
        console.error('❌ Error creating contest broadcast:', error);
        throw error;
    }
};

/**
 *  TẠO BROADCAST NOTIFICATION CHO POST
 */
export const createPostBroadcast = async (postId, postData, adminData) => {
    try {
        const broadcast = {
            type: 'system_announcement',
            priority: 'normal',
            title: 'Bài viết mới',
            message: `Admin ${adminData.fullName || adminData.userName} đã đăng bài mới: "${postData.title}"`,
            relatedTo: {
                type: 'Post',
                id: postId,
                preview: {
                    title: postData.title,
                    content: postData.content?.substring(0, 150) || '',
                    image: postData.images?.[0]?.url || null,
                    hashtags: postData.hashtags || []
                }
            },
            actor: {
                type: 'user',
                userId: adminData._id,
                username: adminData.userName,
                avatar: adminData.avatar
            },
            actionUrl: `/home/${postId}`,
            actionText: 'Xem bài viết',
            metadata: {
                postId: postId,
                hashtags: postData.hashtags || [],
                imagesCount: postData.images?.length || 0
            },
            isActive: true
        };

        const created = await BroadcastNotificationModel.create(broadcast);
        console.log(`✅ Created broadcast notification for post ${postId}`);
        
        return created;
    } catch (error) {
        console.error('❌ Error creating post broadcast:', error);
        throw error;
    }
};

/**
 *  TẠO CONTEST ANNOUNCEMENT (cho participants trong contest)
 */
export const createContestAnnouncementNotification = async (contestId, message, adminData) => {
    try {
        // Lấy danh sách participants của contest
        const mongoose = await import('mongoose');
        const ContestParticipant = mongoose.default.model('ContestParticipant');
        
        const participants = await ContestParticipant.find(
            { contestId },
            'userId'
        ).lean();
        
        const userIds = participants.map(p => p.userId);
        
        if (userIds.length === 0) {
            console.log('⚠️ No participants found for contest announcement');
            return null;
        }

        // Tạo personal notification cho từng participant
        const notification = {
            type: 'contest_announcement',
            priority: 'urgent',
            title: 'Thông báo từ ban tổ chức',
            message: message,
            relatedTo: {
                type: 'Contest',
                id: contestId
            },
            actor: {
                type: 'user',
                userId: adminData._id,
                username: adminData.userName,
                avatar: adminData.avatar
            },
            actionUrl: `/contest/${contestId}`,
            actionText: 'Xem kỳ thi',
            delivery: {
                web: true,
                email: false,
                push: true
            }
        };

        const notifications = userIds.map(userId => ({
            ...notification,
            userId: userId
        }));

        await notificationModel.insertMany(notifications);
        
        console.log(`✅ Created ${notifications.length} contest announcements`);
        
        return notification;
    } catch (error) {
        console.error('❌ Error creating contest announcement:', error);
        throw error;
    }
};

/**
 * Đánh dấu thông báo đã đọc (cho personal notifications)
 */
export const markNotificationAsRead = async (notificationId, userId) => {
    try {
        const notification = await notificationModel.findOneAndUpdate(
            { _id: notificationId, userId: userId },
            { 
                isRead: true,
                readAt: new Date()
            },
            { new: true }
        );
        
        return notification;
    } catch (error) {
        console.error('❌ Error marking notification as read:', error);
        throw error;
    }
};

/**
 * Lấy danh sách thông báo của user (personal notifications)
 */
export const getUserNotifications = async (userId, options = {}) => {
    try {
        const {
            page = 1,
            limit = 20,
            isRead = null,
            type = null
        } = options;

        const skip = (page - 1) * limit;
        const filter = { userId };

        if (isRead !== null) {
            filter.isRead = isRead;
        }

        if (type) {
            filter.type = type;
        }

        const [notifications, total] = await Promise.all([
            notificationModel.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            notificationModel.countDocuments(filter)
        ]);

        return {
            notifications,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    } catch (error) {
        console.error('❌ Error getting user notifications:', error);
        throw error;
    }
};

/**
 * Đếm số thông báo chưa đọc (personal notifications)
 */
export const countUnreadNotifications = async (userId) => {
    try {
        const count = await notificationModel.countDocuments({
            userId,
            isRead: false
        });
        
        return count;
    } catch (error) {
        console.error('❌ Error counting unread notifications:', error);
        return 0;
    }
};

// ✅ EXPORT THÊM CÁC FUNCTION MỚI
export { createContestBroadcast as createContestCreatedNotification };
export { createPostBroadcast as createPostNotification };