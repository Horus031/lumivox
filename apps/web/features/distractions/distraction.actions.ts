"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";

import {
  logDistractionSchema,
  type LogDistractionInput,
} from "./distraction.schemas";

export async function logDistractionAction(
  input: LogDistractionInput
): Promise<ActionResult> {
  const parsed = logDistractionSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid distraction data.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const { supabase, user } = await requireUser();

    const {
      sessionId,
      distractionType,
      durationSeconds,
      note,
    } = parsed.data;

    const { error } = await supabase
      .from("distraction_events")
      .insert({
        user_id: user.id,
        session_id: sessionId,
        distraction_type: distractionType,
        duration_seconds: durationSeconds,
        note: note || null,
      });

    if (error) {
      return {
        success: false,
        message: `Failed to log distraction: ${error.message}`,
      };
    }

    revalidatePath("/focus");

    return {
      success: true,
      message: "Distraction logged.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while logging distraction.",
    };
  }
}