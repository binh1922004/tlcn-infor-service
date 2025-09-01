import dotenv from 'dotenv'
dotenv.config()
export const config = {
    mongodbUri: process.env.MONGODB_URI,
    port: process.env.PORT,
    accessTokenKey: process.env.ACCESS_TOKEN_KEY,
    accessTokenLife: process.env.ACCESS_TOKEN_LIFE,
    refreshTokenKey: process.env.REFRESH_TOKEN_KEY,
    refreshTokenLife: process.env.REFRESH_TOKEN_LIFE,
    email: process.env.EMAIL,
    passEmail: process.env.PASSWORD_EMAIL,
    
}