import { Server } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import { verifyAuthToken } from '../utils/auth.js'; 

export async function initSocket(httpServer, { redisUrl } = {}) {
  const io = new Server(httpServer, {
    cors: { origin: '*' } 
  });

  if (redisUrl) {
    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
  }

  // auth middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) throw new Error('No token');
      const user = await verifyAuthToken(token);
      socket.user = user;
      return next();
    } catch (err) {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    // join private room
    socket.join(`user:${socket.user._id}`);
    if (socket.user.role === 'admin') socket.join('admins');
  });

  return io;
}