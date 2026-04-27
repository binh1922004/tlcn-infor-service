import mongoose from "mongoose";
import { config } from "./env.js";
import { log, logError } from "../src/utils/logger.js";

const connectDB = async () => {
    try{
        await mongoose.connect(config.mongodbUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        log('MongoDB Connected')
    }
    catch (error){
        logError('MongoDB connection error:', error);
        process.exit(1);
    }
}
export default connectDB