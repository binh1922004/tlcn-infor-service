import response from '../helpers/response.js';
import {
    getUserNotifications,
    markNotificationAsRead,
    countUnreadNotifications
} from '../service/notification.service.js';
import notificationModel from '../models/notification.model.js';
import BroadcastNotificationModel from '../models/broadcastNotification.model.js';
import UserNotificationPreference from '../models/userNotificationPreference.model.js';

/**
 *  LẤY DANH SÁCH BROADCASTS
 */
export const getBroadcasts = async (req, res) => {
    try {
        const userId = req.user._id;
        const { lastSeenAt, limit = 20, type } = req.query;

        // Get user preferences
        const preference = await UserNotificationPreference.findOne({ userId }).lean();
        const dismissedIds = preference?.dismissedBroadcasts?.map(id => id.toString()) || [];
        
        // Build filter
        const filter = {
            isActive: true,
            _id: { $nin: dismissedIds }
        };

        if (lastSeenAt) {
            filter.createdAt = { $gt: new Date(lastSeenAt) };
        }

        if (type) {
            filter.type = type;
        }

        const broadcasts = await BroadcastNotificationModel.find(filter)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .lean();

        return response.sendSuccess(res, {
            broadcasts,
            lastSeenAt: preference?.lastSeenBroadcastAt || new Date()
        });
    } catch (error) {
        console.error('getBroadcasts error:', error);
        return response.sendError(res, 'Failed to get broadcasts');
    }
};

/**
 *  ĐÁNH DẤU BROADCAST ĐÃ XEM
 */
export const markBroadcastAsSeen = async (req, res) => {
    try {
        const { broadcastId } = req.params;
        const userId = req.user._id;

        // Update broadcast
        await BroadcastNotificationModel.findByIdAndUpdate(
            broadcastId,
            {
                $addToSet: { seenBy: userId },
                $inc: { seenCount: 1 }
            }
        );
        
        // Update user preference
        await UserNotificationPreference.findOneAndUpdate(
            { userId },
            { lastSeenBroadcastAt: new Date() },
            { upsert: true }
        );

        return response.sendSuccess(res, null, 'Broadcast marked as seen');
    } catch (error) {
        console.error('markBroadcastAsSeen error:', error);
        return response.sendError(res, 'Failed to mark broadcast as seen');
    }
};

/**
 *  DISMISS BROADCAST
 */
export const dismissBroadcast = async (req, res) => {
    try {
        const { broadcastId } = req.params;
        const userId = req.user._id;

        await UserNotificationPreference.findOneAndUpdate(
            { userId },
            { 
                $addToSet: { dismissedBroadcasts: broadcastId },
                $set: { lastSeenBroadcastAt: new Date() }
            },
            { upsert: true }
        );

        return response.sendSuccess(res, null, 'Broadcast dismissed');
    } catch (error) {
        console.error('dismissBroadcast error:', error);
        return response.sendError(res, 'Failed to dismiss broadcast');
    }
};

/**
 *  ĐẾM SỐ BROADCASTS CHƯA XEM
 */
export const getUnseenBroadcastsCount = async (req, res) => {
    try {
        const userId = req.user._id;
        
        const preference = await UserNotificationPreference.findOne({ userId }).lean();
        const lastSeenAt = preference?.lastSeenBroadcastAt || new Date(0);
        const dismissedIds = preference?.dismissedBroadcasts || [];

        const count = await BroadcastNotificationModel.countDocuments({
            isActive: true,
            createdAt: { $gt: lastSeenAt },
            _id: { $nin: dismissedIds }
        });

        return response.sendSuccess(res, { count });
    } catch (error) {
        console.error('getUnseenBroadcastsCount error:', error);
        return response.sendError(res, 'Failed to get unseen broadcasts count');
    }
};

/**
 * Lấy danh sách thông báo cá nhân của user
 */
export const getNotifications = async (req, res) => {
    try {
        const userId = req.user._id;
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const limit = Math.min(50, parseInt(req.query.limit || '20', 10));
        const isRead = req.query.isRead === 'true' ? true : req.query.isRead === 'false' ? false : null;
        const type = req.query.type || null;

        const result = await getUserNotifications(userId, {
            page,
            limit,
            isRead,
            type
        });

        return response.sendSuccess(res, result);
    } catch (error) {
        console.error('getNotifications error:', error);
        return response.sendError(res, 'Failed to get notifications');
    }
};

/**
 * Đánh dấu thông báo cá nhân đã đọc
 */
export const markAsRead = async (req, res) => {
    try {
        const notificationId = req.params.id;
        const userId = req.user._id;

        const notification = await markNotificationAsRead(notificationId, userId);

        if (!notification) {
            return response.sendError(res, 'Notification not found', 404);
        }

        return response.sendSuccess(res, notification, 'Notification marked as read');
    } catch (error) {
        console.error('markAsRead error:', error);
        return response.sendError(res, 'Failed to mark notification as read');
    }
};

/**
 * Đánh dấu tất cả thông báo cá nhân đã đọc
 */
export const markAllAsRead = async (req, res) => {
    try {
        const userId = req.user._id;

        await notificationModel.updateMany(
            { userId, isRead: false },
            { 
                isRead: true,
                readAt: new Date()
            }
        );

        return response.sendSuccess(res, null, 'All notifications marked as read');
    } catch (error) {
        console.error('markAllAsRead error:', error);
        return response.sendError(res, 'Failed to mark all notifications as read');
    }
};

/**
 * Đếm số thông báo cá nhân chưa đọc
 */
export const getUnreadCount = async (req, res) => {
    try {
        const userId = req.user._id;
        const count = await countUnreadNotifications(userId);

        return response.sendSuccess(res, { count });
    } catch (error) {
        console.error('getUnreadCount error:', error);
        return response.sendError(res, 'Failed to get unread count');
    }
};

/**
 * Xóa thông báo cá nhân
 */
export const deleteNotification = async (req, res) => {
    try {
        const notificationId = req.params.id;
        const userId = req.user._id;

        const notification = await notificationModel.findOneAndDelete({
            _id: notificationId,
            userId
        });

        if (!notification) {
            return response.sendError(res, 'Notification not found', 404);
        }

        return response.sendSuccess(res, null, 'Notification deleted');
    } catch (error) {
        console.error('deleteNotification error:', error);
        return response.sendError(res, 'Failed to delete notification');
    }
};

/**
 * Xóa tất cả thông báo cá nhân đã đọc
 */
export const deleteAllRead = async (req, res) => {
    try {
        const userId = req.user._id;

        await notificationModel.deleteMany({
            userId,
            isRead: true
        });

        return response.sendSuccess(res, null, 'All read notifications deleted');
    } catch (error) {
        console.error('deleteAllRead error:', error);
        return response.sendError(res, 'Failed to delete read notifications');
    }
};