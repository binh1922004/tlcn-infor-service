import jwt from 'jsonwebtoken';
import response from '../helpers/response.js';
import { config } from '../../config/env.js';

export const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization']
    let token = authHeader && authHeader.split(' ')[1]

    if (token == null) {
        token = req.cookies?.access_token;
        if (!token){
            return response.sendError(res, "Unauthenticated", 401)
        }
    }
    jwt.verify(token, config.accessTokenKey, (err, user) => {
        if (err)
            return response.sendError(res, "BadRequest", 401);
        //Assign user info from JWT to next req. 
        req.user = user;
        req.userName = user.userName
        next()
    })
}
export const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null; 
    if (!token) {
      req.user = null;
      return next();
    }  
    // Verify token
    const decoded = jwt.verify(token, config.accessTokenKey);   
    req.user = decoded;
    next();
  } catch (error) {
    req.user = null;
    next();
  }
};

// Middleware kiểm tra quyền admin
export const verifyAdmin = (req, res, next) => {
  try {
    // Kiểm tra xem user đã được authenticate chưa
    if (!req.user) {
      return response.sendError(res, "Unauthenticated", 401);
    }
    // Kiểm tra role có phải admin không
    if (req.user.role !== 'admin') {
      return response.sendError(res, "Access denied. Admin role required.", 403);
    }

    next();
  } catch (error) {
    console.error('Error in verifyAdmin middleware:', error);
    return response.sendError(res, "Internal server error", 500);
  }
};

// Middleware kiểm tra quyền admin hoặc owner
export const verifyAdminOrOwner = (req, res, next) => {
  try {
    if (!req.user) {
      return response.sendError(res, "Unauthenticated", 401);
    }

    // Cho phép admin hoặc chính user đó
    const userId = req.params.userId || req.params.userName;
    const isAdmin = req.user.role === 'admin';
    const isOwner = req.user._id === userId || req.user.userName === userId;

    if (!isAdmin && !isOwner) {
      return response.sendError(res, "Access denied. You don't have permission to perform this action.", 403);
    }

    next();
  } catch (error) {
    console.error('Error in verifyAdminOrOwner middleware:', error);
    return response.sendError(res, "Internal server error", 500);
  }
};

export const verifyAdminOrTeacher = (req, res, next) => {
  try {
    // Kiểm tra xem user đã được authenticate chưa
    if (!req.user) {
      return response.sendError(res, "Unauthenticated", 401);
    }

    // Kiểm tra role có phải admin hoặc teacher không
    const userRole = req.user.role;
    if (userRole !== 'admin' && userRole !== 'teacher') {
      return response.sendError(res, "Access denied. Only admin or teacher can perform this action.", 403);
    }

    next();
  } catch (error) {
    console.error('Error in verifyAdminOrTeacher middleware:', error);
    return response.sendError(res, "Internal server error", 500);
  }
};