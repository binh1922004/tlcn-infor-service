import notificationModel from "../models/notification.model.js";


const CONTEST_ANNOUNCEMENT = 'Contest Announcement';
const CONTEST_TYPE = 'contest_announcement';
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