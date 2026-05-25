import { Ratelimit } from "@upstash/ratelimit";

import { getRedisClient } from "@/lib/redis/redis";

type RateLimitConfig = {
  key: string;
  limit: number;
  window: `${number} s` | `${number} m` | `${number} h` | `${number} d`;
};

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  message?: string;
};

export async function checkRateLimit({
  key,
  limit,
  window,
}: RateLimitConfig): Promise<RateLimitResult> {
  const redis = getRedisClient();

  if (!redis) {
    return {
      success: true,
      limit,
      remaining: limit,
      reset: Date.now(),
      message:
        "Redis is not configured. Rate limiting is bypassed in this environment.",
    };
  }

  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
    analytics: true,
    prefix: "lumivox:ratelimit",
  });

  const result = await ratelimit.limit(key);

  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  };
}

export function formatRateLimitMessage(reset: number) {
  const resetDate = new Date(reset);
  const seconds = Math.max(
    1,
    Math.ceil((resetDate.getTime() - Date.now()) / 1000)
  );

  if (seconds < 60) {
    return `Too many requests. Please try again in ${seconds} second(s).`;
  }

  const minutes = Math.ceil(seconds / 60);

  return `Too many requests. Please try again in ${minutes} minute(s).`;
}