import {Server} from "socket.io";
import jwt from "jsonwebtoken";
import {config} from "../../config/env.js";
import response from "../helpers/response.js";
import {isRegisteredForContest} from "../service/contest.service.js";

const SocketSingleton = (function () {
    let instance;

    function createInstance() {
        console.log('Create Socket.io instance on port 8888');
        const io = new Server(8080, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        io.use((socket, next) => {
            const token = socket.handshake.auth.token;
            console.log(`Received token ${token}`);
            if (!token) {
                next();
            }
            jwt.verify(token, config.accessTokenKey, (err, user) => {
                if (err)
                    return next(new Error("Authentication error: Invalid token"));
                //Assign user info from JWT to next req.
                socket.userId = user._id;
                socket.userRole = user.role;
                next()
            })
        });

        let onlineUsers = new Map();

        io.on("connection", (socket) => {
            socket.join('broadcasts');
            console.log(`✓ Socket ${socket.id} joined broadcasts room`);
            socket.on("disconnect", () => {
                for (let [userId, socketId] of onlineUsers.entries()) {
                    if (socketId === socket.id) {
                        onlineUsers.delete(userId);
                        console.log(`✗ User ${userId} disconnected`);
                        break;
                    }
                }
            });

            socket.on('register', () => {
                const userId = socket.userId;
                onlineUsers.set(userId, socket.id);
                console.log(`✓ User ${userId} registered with socket ${socket.id}`);

                socket.emit('connected', {
                    userId,
                    message: 'Connected to notification system',
                    onlineUsers: onlineUsers.size
                });
            });

            socket.on('join-contest', ({contestId}) => {
                try{
                    const userId = socket.userId;
                    const isRegistered = isRegisteredForContest(userId, contestId);
                    if (!isRegistered) {
                        console.log(`User ${userId} is not registered for contest ${contestId}`);
                        socket.emit('error', { message: 'Not registered for this contest' });
                    }
                    else{
                        socket.join(`contest-${contestId}`);
                        console.log(`User ${userId} joined contest room: contest-${contestId}`);
                        socket.emit('contest-joined', { contestId });
                    }
                }
                catch (error){
                    console.error('Error joining contest room:', error);
                    socket.emit('error', { message: 'Error joining contest room' });
                }
            });

            // Mark broadcast as seen
            socket.on('mark-broadcast-seen', async ({ broadcastId }) => {
                try {
                    const userId = socket.userId;
                    if (!userId) return;
                    
                    const { markBroadcastAsSeen } = await import('../service/broadcast.service.js');
                    await markBroadcastAsSeen(broadcastId, userId);
                    
                    // Update lastSeenBroadcastAt
                    const UserNotificationPreference = (await import('../models/userNotificationPreference.model.js')).default;
                    await UserNotificationPreference.findOneAndUpdate(
                        { userId },
                        { lastSeenBroadcastAt: new Date() },
                        { upsert: true }
                    );
                    
                    socket.emit('broadcast-seen-success', { broadcastId });
                } catch (error) {
                    console.error('Error marking broadcast as seen:', error);
                    socket.emit('error', { message: 'Failed to mark broadcast as seen' });
                }
            });

            // Dismiss broadcast
            socket.on('dismiss-broadcast', async ({ broadcastId }) => {
                try {
                    const userId = socket.userId;
                    if (!userId) return;
                    
                    const UserNotificationPreference = (await import('../models/userNotificationPreference.model.js')).default;
                    await UserNotificationPreference.findOneAndUpdate(
                        { userId },
                        { 
                            $addToSet: { dismissedBroadcasts: broadcastId },
                            $set: { lastSeenBroadcastAt: new Date() }
                        },
                        { upsert: true }
                    );
                    socket.emit('broadcast-dismissed-success', { broadcastId });
                } catch (error) {
                    console.error('Error dismissing broadcast:', error);
                    socket.emit('error', { message: 'Failed to dismiss broadcast' });
                }
            });

            // Get broadcasts
            socket.on('get-broadcasts', async ({ lastSeenAt, limit = 20, type = null }) => {
                try {
                    const userId = socket.userId;
                    if (!userId) return;
                    
                    const { getBroadcastNotifications } = await import('../service/broadcast.service.js');
                    const UserNotificationPreference = (await import('../models/userNotificationPreference.model.js')).default;
                    
                    const broadcasts = await getBroadcastNotifications(userId, lastSeenAt, { limit, type });
                    
                    // Filter dismissed broadcasts
                    const preference = await UserNotificationPreference.findOne({ userId }).lean();
                    const dismissedIds = preference?.dismissedBroadcasts?.map(id => id.toString()) || [];
                    
                    const filteredBroadcasts = broadcasts.filter(
                        b => !dismissedIds.includes(b._id.toString())
                    );
                    
                    socket.emit('broadcasts-list', { 
                        broadcasts: filteredBroadcasts,
                        lastSeenAt: preference?.lastSeenBroadcastAt 
                    });
                } catch (error) {
                    console.error('Error getting broadcasts:', error);
                    socket.emit('error', { message: 'Failed to get broadcasts' });
                }
            });

             // Mark notification as read
            socket.on('mark-notification-read', async ({ notificationId }) => {
                try {
                    const userId = socket.userId;
                    const { markNotificationAsRead } = await import('../service/notification.service.js');
                    await markNotificationAsRead(notificationId, userId);
                    socket.emit('notification-read-success', { notificationId });
                } catch (error) {
                    console.error('Error marking notification as read:', error);
                    socket.emit('error', { message: 'Failed to mark notification as read' });
                }
            });
        });

        return {
            sendMessageToSocketId: function (userId, event, data){
                const socketId = onlineUsers.get(userId);
                if (socketId){
                    console.log(`--> Sending event ${event} to user ${userId} on socket ${socketId}`);
                    io.to(socketId).emit(event, data)
                }
            },
            sendMessageToRoom: function (room, event, data) {
                console.log(`--> Sending event ${event} to room ${room}`);
                io.to(room).emit(event, data);
            },
            //Post
            sendMessageToUser: function (userId, event, data) {
                const socketId = onlineUsers.get(userId);
                if (socketId) {
                    console.log(`📤 Sending event ${event} to user ${userId} on socket ${socketId}`);
                    io.to(socketId).emit(event, data);
                } else {
                    console.log(`⚠️ User ${userId} not online`);
                }
            },
            broadcastToAll: function (event, data) {
                console.log(`📢 Broadcasting event ${event} to broadcasts room`);
                console.log(`📊 Data:`, JSON.stringify(data, null, 2));
                
                io.to('broadcasts').emit(event, data);
                console.log(`✅ Broadcasted to all users in broadcasts room`);
            },
             sendMessageToContestRoom: function (contestId, event, data) {
                console.log(`📢 Sending event ${event} to contest room contest-${contestId}`);
                io.to(`contest-${contestId}`).emit(event, data);
            },
            getOnlineUsersCount: function() {
                return onlineUsers.size;
            }
        }
    }
    return {
        getInstance: function () {
            if (!instance) {
                instance = createInstance();
            }
            return instance;
        }
    }
})();

export const sendMessageToUser = (userId, event, data) => {
    console.log(`📤 Sending to user ${userId} - ${event}`);
    const socket = SocketSingleton.getInstance();
    socket.sendMessageToUser(userId, event, data);
}


export const sendMessageToContestRoom = (contestId, event, data) => {
    console.log(`📢 Contest ${contestId} - ${event}`);
    const socket = SocketSingleton.getInstance();
    socket.sendMessageToContestRoom(contestId, event, data);
}
export const broadcastNewPost = (broadcastData) => {
    console.log(`📢 Broadcasting new post notification`);
    const socket = SocketSingleton.getInstance();
    socket.broadcastToAll('new-broadcast', {
        type: 'system_announcement',
        ...broadcastData
    });
}
export const broadcastNewContest = (broadcastData) => {
    console.log(`📢 Broadcasting new contest notification`);
    const socket = SocketSingleton.getInstance();
    socket.broadcastToAll('new-broadcast', {
        type: 'contest_announcement',
        ...broadcastData
    });
}

export const setupSocket = () => {
    SocketSingleton.getInstance();
}