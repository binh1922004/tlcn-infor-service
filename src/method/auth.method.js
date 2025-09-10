import jwt from 'jsonwebtoken';
import {config} from '../../config/env.js';

export const generateJwt = (payload, key, lifeTime) => {
    return jwt.sign(payload,
        key,
    {
        algorithm: 'HS256',
        expiresIn: lifeTime
    })
}

export const generateToken = (user) => {
    return {accessToken: generateAccessToken(user), refreshToken: generateRefreshToken(user)}
}

const generateAccessToken = (user) => {
    const payload = {userName: user.userName, role: user.role, _id: user._id}
    return generateJwt(payload, config.accessTokenKey, config.accessTokenLife);
}

const generateRefreshToken = (user) => {
    const payload = {userName: user.userName}
    return generateJwt(payload, config.refreshTokenKey, config.refreshTokenLife);
}