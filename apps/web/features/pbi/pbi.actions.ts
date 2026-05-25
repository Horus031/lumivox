"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";
import { checkRateLimit, formatRateLimitMessage } from "@/lib/redis/rate-limit";

export async function generateCurrentPbiSnapshotAction(): Promise<ActionResult> {
  try {
    const { user } = await requireUser();

    const rateLimit = await checkRateLimit({
      key: `pbi-refresh:${user.id}`,
      limit: 5,
      window: "10 m",
    });

    if (!rateLimit.success) {
      return {
        success: false,
        message: formatRateLimitMessage(rateLimit.reset),
      };
    }

    const response = await fetch(
      `${process.env.AI_API_BASE_URL}/api/v1/pbi/generate-snapshot`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-lumivox-internal-key": process.env.AI_INTERNAL_API_KEY ?? "",
        },
        body: JSON.stringify({
          user_id: user.id,
        }),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();

      return {
        success: false,
        message: `Failed to generate PBI snapshot: ${errorBody}`,
      };
    }

    const data = await response.json();

    revalidatePath("/dashboard");

    return {
      success: true,
      message: "PBI snapshot refreshed successfully.",
      data,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while generating PBI snapshot.",
    };
  }
}
