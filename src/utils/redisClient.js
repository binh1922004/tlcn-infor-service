import { createClient } from "redis";
import {config} from "../../config/env.js";
import { log, logError } from "./logger.js";
import {redis} from "googleapis/build/src/apis/redis/index.js";

const redisHost = config.redis_host || "redis://localhost:6379";

console.log(redisHost)
const redisClient = createClient({
  url: `${redisHost}`,
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