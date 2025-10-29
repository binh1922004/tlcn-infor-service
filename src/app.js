import express from 'express';
import userRoutes from './routes/user.routes.js';
import authRoutes from './routes/auth.routes.js';
import postRoutes from './routes/post.routes.js'
import problemRoutes from "./routes/problem.routes.js";
import uploadPostRoutes from './routes/uploadPost.routes.js';
import commentRoutes from './routes/comment.routes.js';
import cookieParser from "cookie-parser";
import cors from "cors";
import submissionRoute from "./routes/submission.route.js";
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(
  cors({
    origin: [
      "http://localhost:5173", // Frontend Vite
      "http://127.0.0.1:5173", // Alternative localhost
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
    ],
    optionsSuccessStatus: 200,
  })
);

app.use(cookieParser())
app.use('/api/users', userRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/problems', problemRoutes)
app.use('/api/submissions', submissionRoute)

app.use('/api/posts', postRoutes)
app.use('/api/upload/posts', uploadPostRoutes);
app.use('/api/comments', commentRoutes);
export default app;
