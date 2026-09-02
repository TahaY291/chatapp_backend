import redis from "ioredis";

import * as dotenv from "dotenv";

dotenv.config();

if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL is not defined in the environment variables.");
}

export const redisClient = new redis(process.env.REDIS_URL);

redisClient.on('connect', () => {
    console.log('Connected to Redis');
});

redisClient.on('error', (err: Error) => {
    console.error('Redis error:', err);
});