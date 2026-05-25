"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";
import { checkRateLimit, formatRateLimitMessage } from "@/lib/redis/rate-limit";

export async function refreshNativeTaskRiskScanAction(): Promise<ActionResult> {
  try {
    const { user } = await requireUser();

    const rateLimit = await checkRateLimit({
      key: `native-task-risk-refresh:${user.id}`,
      limit: 5,
      window: "10 m",
    });

    if (!rateLimit.success) {
      return {
        success: false,
        message: formatRateLimitMessage(rateLimit.reset),
      };
    }

    const apiBaseUrl = process.env.AI_API_BASE_URL;
    const internalKey = process.env.AI_INTERNAL_API_KEY;

    if (!apiBaseUrl || !internalKey) {
      return {
        success: false,
        message:
          "AI backend environment variables are not configured correctly.",
      };
    }

    const response = await fetch(`${apiBaseUrl}/api/v1/native-task-risk/scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-lumivox-internal-key": internalKey,
      },
      body: JSON.stringify({
        user_id: user.id,
        task_id: null,
        horizon_days: 14,
        focus_window_days: 7,
        history_window_days: 30,
        persist_assessments: true,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorBody = await response.text();

      return {
        success: false,
        message: `Native task risk scan failed: ${errorBody}`,
      };
    }

    revalidatePath("/dashboard");

    return {
      success: true,
      message: "Native task risk scan refreshed successfully.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while refreshing native task risk scan.",
    };
  }
}
