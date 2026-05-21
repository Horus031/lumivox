"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";

type GenerateWeeklyReflectionApiResponse = {
  reflection_id: string | null;
  card_id: string | null;
  reflection_direction:
    | "improving"
    | "stable"
    | "mixed"
    | "needs_attention";
};

export async function generateWeeklyReflectionAction(): Promise<
  ActionResult<{
    reflectionId: string | null;
    cardId: string | null;
  }>
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
      `${apiBaseUrl}/api/v1/reflections/weekly/generate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-lumivox-internal-key": internalKey,
        },
        body: JSON.stringify({
          user_id: user.id,
          persist_reflection: true,
          generate_ai_card: true,
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();

      return {
        success: false,
        message: `Weekly reflection generation failed: ${errorBody}`,
      };
    }

    const data =
      (await response.json()) as GenerateWeeklyReflectionApiResponse;

    revalidatePath("/dashboard");
    revalidatePath("/reflections");

    return {
      success: true,
      message: "Weekly reflection generated successfully.",
      data: {
        reflectionId: data.reflection_id,
        cardId: data.card_id,
      },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while generating weekly reflection.",
    };
  }
}