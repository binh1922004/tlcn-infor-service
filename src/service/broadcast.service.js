import BroadcastNotificationModel from "../models/broadcastNotification.model.js";
import userModel from "../models/user.models.js";
/**
 *   Lấy danh sách broadcast notifications
 */
export const getBroadcastNotifications = async (
  userId,
  lastSeenAt,
  options = {},
) => {
  try {
    const { limit = 20, type = null } = options;

    const filter = {
      isActive: true,
    };

    const user = await userModel.findById(userId).select("createdAt").lean();
    if (user && user.createdAt) {
      filter.createdAt = { $gte: user.createdAt };
    }

    if (lastSeenAt) {
      filter.createdAt = {
        ...filter.createdAt,
        $gt: new Date(lastSeenAt),
      };
    }

    if (type) {
      filter.type = type;
    }

    const broadcasts = await BroadcastNotificationModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    return broadcasts;
  } catch (error) {
    console.error("   Error getting broadcast notifications:", error);
    throw error;
  }
};

/**
 * Đánh dấu user đã xem broadcast
 */
export const markBroadcastAsSeen = async (broadcastId, userId) => {
  try {
    const broadcast = await BroadcastNotificationModel.findByIdAndUpdate(
      broadcastId,
      {
        $addToSet: { seenBy: userId },
        $inc: { seenCount: 1 },
      },
      { new: true },
    );

    console.log(`Broadcast ${broadcastId} marked as seen by user ${userId}`);
    return broadcast;
  } catch (error) {
    console.error("Error marking broadcast as seen:", error);
    throw error;
  }
};

/**
 *   Xóa broadcast notification cũ (cleanup job)
 */
export const cleanupOldBroadcasts = async (daysOld = 30) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await BroadcastNotificationModel.deleteMany({
      createdAt: { $lt: cutoffDate },
    });

    console.log(`🧹 Cleaned up ${result.deletedCount} old broadcasts`);
    return result;
  } catch (error) {
    console.error("   Error cleaning up broadcasts:", error);
    throw error;
  }
};

/**
 *   Đếm số broadcasts chưa xem của user
 */
export const countUnseenBroadcasts = async (
  userId,
  lastSeenAt,
  dismissedIds = [],
) => {
  try {
    const filter = {
      isActive: true,
      _id: { $nin: dismissedIds },
    };

    if (lastSeenAt) {
      filter.createdAt = { $gt: new Date(lastSeenAt) };
    }

    const count = await BroadcastNotificationModel.countDocuments(filter);
    return count;
  } catch (error) {
    console.error("   Error counting unseen broadcasts:", error);
    return 0;
  }
};

/**
 *   Deactivate broadcast (soft delete)
 */
export const deactivateBroadcast = async (broadcastId) => {
  try {
    const broadcast = await BroadcastNotificationModel.findByIdAndUpdate(
      broadcastId,
      { isActive: false },
      { new: true },
    );

    console.log(`  Broadcast ${broadcastId} deactivated`);
    return broadcast;
  } catch (error) {
    console.error("   Error deactivating broadcast:", error);
    throw error;
  }
};

/**
 *   Get broadcast by ID
 */
export const getBroadcastById = async (broadcastId) => {
  try {
    const broadcast =
      await BroadcastNotificationModel.findById(broadcastId).lean();
    return broadcast;
  } catch (error) {
    console.error("   Error getting broadcast by ID:", error);
    throw error;
  }
};

/**
 *   Update broadcast
 */
export const updateBroadcast = async (broadcastId, updateData) => {
  try {
    const broadcast = await BroadcastNotificationModel.findByIdAndUpdate(
      broadcastId,
      updateData,
      { new: true },
    );

    console.log(`  Broadcast ${broadcastId} updated`);
    return broadcast;
  } catch (error) {
    console.error("   Error updating broadcast:", error);
    throw error;
  }
};
