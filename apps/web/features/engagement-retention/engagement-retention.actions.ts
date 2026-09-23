"use server";

import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";
import {
  invalidateEngagementCache,
  recalculateEngagementForUser,
} from "@/features/engagement-retention/engagement-retention.server";
import { checkRateLimit, formatRateLimitMessage } from "@/lib/redis/rate-limit";

export async function refreshEngagementSummaryAction(): Promise<ActionResult> {
  try {
    const { user } = await requireUser();

    const rateLimit = await checkRateLimit({
      key: `engagement-recalculate:${user.id}`,
      limit: 10,
      window: "10 m",
    });

    if (!rateLimit.success) {
      return {
        success: false,
        message: formatRateLimitMessage(rateLimit.reset),
      };
    }

    // An explicit refresh must bypass the short-lived response cache.
    await invalidateEngagementCache(user.id);
    await recalculateEngagementForUser(user.id);

    return {
      success: true,
      message: "Engagement summary refreshed successfully.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while refreshing engagement summary.",
    };
  }
}

export async function restoreStreakWithTokensAction(): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();

    const { data, error } = await supabase.rpc("restore_my_streak_with_tokens");

    if (error) {
      return {
        success: false,
        message: error.message,
      };
    }

    // The restore RPC changes the aggregate engagement row directly, so any
    // cached recalculation response must not survive this mutation.
    await invalidateEngagementCache(user.id);

    return {
      success: true,
      message:
        typeof data === "object" &&
        data !== null &&
        "message" in data &&
        typeof data.message === "string"
          ? data.message
          : "Streak restored successfully.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while restoring streak.",
    };
  }
}
