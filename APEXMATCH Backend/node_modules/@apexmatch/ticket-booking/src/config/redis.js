import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisClient = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true
});

redisClient.on('connect', () => {
  console.log('Redis connected');
});

redisClient.on('error', (error) => {
  console.error('Redis connection error:', error.message);
});

export default redisClient;