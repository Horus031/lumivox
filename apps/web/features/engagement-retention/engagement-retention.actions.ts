"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";
import { recalculateEngagementForUser } from "@/features/engagement-retention/engagement-retention.server";

export async function refreshEngagementSummaryAction(): Promise<ActionResult> {
  try {
    const { user } = await requireUser();

    await recalculateEngagementForUser(user.id);

    revalidatePath("/dashboard");
    revalidatePath("/settings");
    revalidatePath("/", "layout");

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
    const { supabase } = await requireUser();

    const { data, error } = await supabase.rpc("restore_my_streak_with_tokens");

    if (error) {
      return {
        success: false,
        message: error.message,
      };
    }

    revalidatePath("/dashboard");
    revalidatePath("/settings");
    revalidatePath("/", "layout");

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
