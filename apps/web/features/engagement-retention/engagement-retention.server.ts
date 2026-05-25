"use server";

import { fetchAiApi } from "@/lib/ai-api/fetch-ai-api";
import { deleteCacheByKey, getOrSetJsonCache } from "@/lib/redis/cache";

type RecalculateEngagementApiResponse = {
  stats: {
    current_streak_days: number;
    longest_streak_days: number;
    streak_status: "active" | "frozen" | "lost";
    token_balance: number;
  };
};

function engagementCacheKey(userId: string) {
  return `lumivox:engagement:recalculate:${userId}`;
}

export async function recalculateEngagementForUser(
  userId: string,
): Promise<RecalculateEngagementApiResponse> {
  return getOrSetJsonCache({
    key: engagementCacheKey(userId),
    ttlSeconds: 30,
    fetcher: () =>
      fetchAiApi<RecalculateEngagementApiResponse>({
        path: "/api/v1/engagement/recalculate",
        body: {
          user_id: userId,
          persist_results: true,
        },
      }),
  });
}

export async function invalidateEngagementCache(userId: string) {
  await deleteCacheByKey(engagementCacheKey(userId));
}
