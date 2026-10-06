import { Ratelimit } from "@upstash/ratelimit";

import { getRedisClient } from "@/lib/redis/redis";

type RateLimitConfig = {
  key: string;
  limit: number;
  window: `${number} s` | `${number} m` | `${number} h` | `${number} d`;
  mode?: "fail-open" | "fail-closed";
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
  mode,
}: RateLimitConfig): Promise<RateLimitResult> {
  const redis = getRedisClient();

  if (!redis) {
    if (mode === "fail-closed") {
      return {
        success: false,
        limit,
        remaining: 0,
        reset: Date.now() + 5_000,
        message:
          "Request protection is temporarily unavailable. Please try again shortly.",
      };
    }

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

  try {
    const result = await ratelimit.limit(key);

    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch {
    if (mode === "fail-closed") {
      return {
        success: false,
        limit,
        remaining: 0,
        reset: Date.now() + 5_000,
        message:
          "Request protection is temporarily unavailable. Please try again shortly.",
      };
    }

    return {
      success: true,
      limit,
      remaining: limit,
      reset: Date.now(),
      message:
        "Rate limiting is temporarily unavailable and bypassed in this environment.",
    };
  }
}

export function formatRateLimitMessage(reset: number) {
  const resetDate = new Date(reset);
  const seconds = Math.max(
    1,
    Math.ceil((resetDate.getTime() - Date.now()) / 1000),
  );

  if (seconds < 60) {
    return `Too many requests. Please try again in ${seconds} second(s).`;
  }

  const minutes = Math.ceil(seconds / 60);

  return `Too many requests. Please try again in ${minutes} minute(s).`;
}
