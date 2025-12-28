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
import classroom from "./routes/classroom.routes.js"
import {config} from "../config/env.js";
import adminContestRoutes from "./routes/admin.contest.routes.js";
import contestRoutes from "./routes/contest.routes.js";
import materialRoutes from './routes/material.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import broadcastRoutes from './routes/broadcast.routes.js';
import adminSubmissionRoutes from "./routes/admin.submission.routes.js";
import solutionRoutes from './routes/solution.routes.js';
import teacherContestRoutes from './routes/teacher.contest.routes.js';
import teacherSubmissionRoutes from './routes/teacher.submission.routes.js';
import statisticsRoutes from './routes/statistics.routes.js';
import adminCommentRoutes from './routes/admin.comment.routes.js';
console.log(config.fe_url)
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(
  cors({
    origin: [
      "http://localhost:5173", // Frontend Vite
      "http://127.0.0.1:5173",
      "http://localhost:5174", // Frontend Vite
      "http://127.0.0.1:5174", // Alternative localhost
      "http://localhost:5175",
      "http://127.0.0.1:5175"
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
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
app.use('/api/statistics', statisticsRoutes);
app.use('/api/posts', postRoutes)
app.use('/api/upload/posts', uploadPostRoutes);

app.use('/api/comments', commentRoutes);
app.use('/api/contests', contestRoutes);
app.use('/api/teacher/contests', teacherContestRoutes);
app.use('/api/teacher/submissions', teacherSubmissionRoutes);
app.use('/api/admin/contests', adminContestRoutes);
app.use('/api/admin/submissions', adminSubmissionRoutes)
app.use('/api/classroom', classroom);
app.use('/api/classroom', materialRoutes); 
app.use('/api/notifications', notificationRoutes);
app.use('/api/broadcasts', broadcastRoutes);
app.use('/api/solutions', solutionRoutes);
app.use('/api/admin/comments', adminCommentRoutes); 
export default app;
