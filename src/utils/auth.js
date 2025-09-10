import jwt from 'jsonwebtoken';
import { config } from '../../config/env.js';

export function verifyAuthToken(token) {
  return new Promise((resolve, reject) => {
    if (!token) return reject(new Error('No token provided'));
    jwt.verify(token, config.accessTokenKey, (err, user) => {
      if (err) return reject(err);
      resolve(user); // user chứa _id, userName, role...
    });
  });
}