import Redis from 'ioredis';
import config from './config';

// Singleton Redis client
let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(config.database.redis.url, {
      maxRetriesPerRequest: config.database.redis.maxRetries,
      keyPrefix: config.database.redis.keyPrefix,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Redis Client Connected');
    });
  }

  return redisClient;
}

// Cache helper functions
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  const value = await redis.get(key);
  
  if (!value) {
    return null;
  }
  
  try {
    return JSON.parse(value) as T;
  } catch {
    return value as T;
  }
}

export async function cacheSet(
  key: string,
  value: any,
  ttl: number = config.database.cache.defaultTtl
): Promise<void> {
  const redis = getRedisClient();
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  await redis.setex(key, ttl, serialized);
}

export async function cacheDel(key: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(key);
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  const redis = getRedisClient();
  const keys = await redis.keys(pattern);
  
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

export default getRedisClient;
