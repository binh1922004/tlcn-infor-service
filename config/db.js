import mongoose from "mongoose";
import { config } from "./env.js";
const connectDB = async () => {
    try{
        await mongoose.connect(config.mongodbUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('MongoDB Connnected')
    }
    catch (error){
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
}
export default connectDB