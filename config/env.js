import dotenv from 'dotenv'
dotenv.config()
export const config = {
    mongodbUri: process.env.MONGODB_URI,
    port: process.env.PORT
    
}

