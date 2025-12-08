import dotenv from 'dotenv'
import kafka from "kafkajs";
import path from "path";
// // Xác định môi trường hiện tại
// const env = process.env.NODE_ENV || 'dev';
// // Load file .env tương ứng
// dotenv.config({
//     path: path.resolve(process.cwd(), `.env.${env}`)
// });
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env'
dotenv.config({path: path.resolve(process.cwd(), envFile) })

export const config = {
    mongodbUri: process.env.MONGODB_URI,
    port: process.env.PORT,
    accessTokenKey: process.env.ACCESS_TOKEN_KEY,
    accessTokenLife: process.env.ACCESS_TOKEN_LIFE,
    refreshTokenKey: process.env.REFRESH_TOKEN_KEY,
    refreshTokenLife: process.env.REFRESH_TOKEN_LIFE,
    email: process.env.EMAIL,
    passEmail: process.env.PASSWORD_EMAIL,
    client_id: process.env.CLIENT_ID,
    client_secret_id: process.env.CLIENT_SECRET_ID,
    fe_url: process.env.FE_URL,
    fe_localhost_url: process.env.FE_LOCALHOST_URL,
    fe_teacher_localhost_url: process.env.FE_TEACHER_LOCALHOST_URL,
    aws_access_key: process.env.AWS_ACCESS_KEY,
    aws_secret_key: process.env.AWS_SECRET_ACCESS_KEY,
    bucket_name: process.env.BUCKET_NAME,
    bucket_region: process.env.BUCKET_REGION,
    kafka_brokers: process.env.KAFKA_BROKER,
    kafka_submission_topic: process.env.KAFKA_SUBMISSION_TOPIC,
    redis_host: process.env.REDIS_HOST,
    callback_url: process.env.CALLBACK_URL
}