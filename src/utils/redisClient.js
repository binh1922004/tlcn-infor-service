import { createClient } from "redis";
import {config} from "../../config/env.js";
import { log, logError } from "./logger.js";

const redisHost = config.redis_host || "localhost:6379";

const redisClient = createClient({
  url: `redis://${redisHost}`,
});

redisClient.on("error", (err) => logError("Redis error:", err));

// Sử dụng IIFE để connect
(async () => {
  try {
    if (!process.env.CI){
      await redisClient.connect();
    }
    log("Redis connected successfully");
  } catch (error) {
    logError("Redis connection error:", error);
  }
})();

export default redisClient;