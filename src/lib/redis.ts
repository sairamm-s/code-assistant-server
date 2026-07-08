import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: null,
});

export default redis;
