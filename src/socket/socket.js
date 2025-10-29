import {Server} from "socket.io";
import jwt from "jsonwebtoken";
import {config} from "../../config/env.js";
import response from "../helpers/response.js";

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
                next()
            })
        });
        let onlineUsers = new Map();
        io.on("connection", (socket) => {
            console.log("✅ A user connected:", socket.id);
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
        });

        return {
            sendMessageToSocketId: function (userId, event, data){
                const socketId = onlineUsers.get(userId);
                if (socketId){
                    console.log(`--> Sending event ${event} to user ${userId} on socket ${socketId}`);
                    io.to(socketId).emit(event, data)
                }
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
    console.log(`<UNK> User ${userId} sendMessageToUser ${event}`);
    const socket = SocketSingleton.getInstance();
    socket.sendMessageToSocketId(userId, event, data);
}

export const setupSocket = () => {
    SocketSingleton.getInstance();
}