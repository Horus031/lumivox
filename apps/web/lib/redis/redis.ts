import { Redis } from "@upstash/redis";

export function getRedisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    // Return null in case local dev doesn't have env
    return null;
  }

  return new Redis({
    url,
    token,
  });
}