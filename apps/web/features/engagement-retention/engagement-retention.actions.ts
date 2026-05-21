"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";

type RecalculateEngagementApiResponse = {
  stats: {
    current_streak_days: number;
    longest_streak_days: number;
    token_balance: number;
  };
};

export async function refreshEngagementSummaryAction(): Promise<
  ActionResult
> {
  try {
    const { user } = await requireUser();

    const apiBaseUrl = process.env.AI_API_BASE_URL;
    const internalKey = process.env.AI_INTERNAL_API_KEY;

    if (!apiBaseUrl || !internalKey) {
      return {
        success: false,
        message:
          "AI backend environment variables are not configured correctly.",
      };
    }

    const response = await fetch(
      `${apiBaseUrl}/api/v1/engagement/recalculate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-lumivox-internal-key": internalKey,
        },
        body: JSON.stringify({
          user_id: user.id,
          persist_results: true,
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();

      return {
        success: false,
        message: `Engagement refresh failed: ${errorBody}`,
      };
    }

    await response.json() as RecalculateEngagementApiResponse;

    revalidatePath("/dashboard");

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