import jwt from 'jsonwebtoken';
import response from '../helpers/response.js';
import { config } from '../../config/env.js';

export const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization']
    let token = authHeader && authHeader.split(' ')[1]

    if (token == null) {
        token = req.cookies?.access_token;
        console.log('AccessToken from middleware: ', token);
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
    
    console.log('🔍 OptionalAuth Debug:', {
      hasAuthHeader: !!authHeader,
      hasToken: !!token,
      tokenPreview: token ? `${token.slice(0, 20)}...` : 'No token'
    });
    
    if (!token) {
      console.log('🔍 OptionalAuth - No token, proceeding as guest');
      req.user = null;
      return next();
    }
    
    // Verify token
    const decoded = jwt.verify(token, config.accessTokenKey);
    
    console.log('🔍 OptionalAuth - Token verified:', {
      userName: decoded.userName,
      _id: decoded._id,
      role: decoded.role
    });
    
    req.user = decoded;
    next();
  } catch (error) {
    console.log('🔍 OptionalAuth - Token invalid, proceeding as guest:', error.message);
    req.user = null;
    next();
  }
};