import { getRedisClient } from "@/lib/redis/redis";

type GetOrSetCacheOptions<T> = {
  key: string;
  ttlSeconds: number;
  fetcher: () => Promise<T>;
};

const inFlight = new Map<string, Promise<unknown>>();

async function runSingleFlight<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;

  if (existing) return existing;

  const request = fetcher().finally(() => {
    if (inFlight.get(key) === request) {
      inFlight.delete(key);
    }
  });

  inFlight.set(key, request);

  return request;
}

export async function getOrSetJsonCache<T>({
  key,
  ttlSeconds,
  fetcher,
}: GetOrSetCacheOptions<T>): Promise<T> {
  const redis = getRedisClient();

  if (!redis) {
    return runSingleFlight(key, fetcher);
  }

  const cached = await redis.get<T>(key);

  if (cached !== null && cached !== undefined) {
    return cached;
  }

  return runSingleFlight(key, async () => {
    // Another request on this instance may have populated Redis while this
    // request was waiting for the single-flight slot.
    const secondRead = await redis.get<T>(key);

    if (secondRead !== null && secondRead !== undefined) {
      return secondRead;
    }

    const fresh = await fetcher();

    await redis.set(key, fresh, {
      ex: ttlSeconds,
    });

    return fresh;
  });
}

export async function deleteCacheByKey(key: string) {
  const redis = getRedisClient();

  if (!redis) return;

  await redis.del(key);
}
