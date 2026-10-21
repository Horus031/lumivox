"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";
import { logDistractionSchema } from "@/features/distractions/distraction.schemas";

const logFocusV2DistractionSchema = logDistractionSchema.strict();
export type LogFocusV2DistractionInput = z.input<typeof logFocusV2DistractionSchema>;

// Manual, explicit user action only. Never called by a visibility event.
export async function logFocusV2DistractionAction(
  input: LogFocusV2DistractionInput,
): Promise<ActionResult> {
  if (process.env.FOCUS_V2_ENABLED !== "true") {
    return { success: false, message: "Focus V2 is not enabled." };
  }
  const parsed = logFocusV2DistractionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Invalid distraction data.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const { supabase, user } = await requireUser();
    const { sessionId, distractionType, durationSeconds, note } = parsed.data;
    const { data: parent, error: parentError } = await supabase
      .from("focus_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .eq("session_mode", "pomodoro")
      .in("status", ["ongoing", "paused"])
      .maybeSingle();
    if (parentError) return { success: false, message: "Could not verify the focus session." };
    if (!parent) return { success: false, message: "No active Pomodoro session found." };

    const { data: focus, error: segmentError } = await supabase
      .from("focus_session_segments")
      .select("id")
      .eq("session_id", sessionId)
      .eq("segment_kind", "focus")
      .in("status", ["running", "paused"])
      .maybeSingle();
    if (segmentError) return { success: false, message: "Could not verify the focus round." };
    if (!focus) return { success: false, message: "Distractions can only be logged during a focus round." };

    const { error } = await supabase.from("distraction_events").insert({
      user_id: user.id,
      session_id: sessionId,
      distraction_type: distractionType,
      duration_seconds: durationSeconds,
      note: note || null,
    });
    if (error) return { success: false, message: "Could not save the distraction." };
    return { success: true, message: "Distraction saved.", data: null };
  } catch {
    return { success: false, message: "Could not save the distraction." };
  }
}
