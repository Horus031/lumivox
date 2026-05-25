import { getRedisClient } from "@/lib/redis/redis";

type GetOrSetCacheOptions<T> = {
  key: string;
  ttlSeconds: number;
  fetcher: () => Promise<T>;
};

export async function getOrSetJsonCache<T>({
  key,
  ttlSeconds,
  fetcher,
}: GetOrSetCacheOptions<T>): Promise<T> {
  const redis = getRedisClient();

  if (!redis) {
    return fetcher();
  }

  const cached = await redis.get<T>(key);

  if (cached) {
    return cached;
  }

  const fresh = await fetcher();

  await redis.set(key, fresh, {
    ex: ttlSeconds,
  });

  return fresh;
}

export async function deleteCacheByKey(key: string) {
  const redis = getRedisClient();

  if (!redis) return;

  await redis.del(key);
}