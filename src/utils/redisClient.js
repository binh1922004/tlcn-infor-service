import { createClient } from "redis";
import {config} from "../../config/env.js";
const redisHost = config.redis_host || "localhost:6379";

const redisClient = createClient({
  url: `redis://${redisHost}`,
});

redisClient.on("error", (err) => console.error("Redis error:", err));

// Sử dụng IIFE để connect
(async () => {
  try {
    await redisClient.connect();
    console.log("Redis connected successfully");
  } catch (error) {
    console.error("Redis connection error:", error);
  }
})();

export default redisClient;