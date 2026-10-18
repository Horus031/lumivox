"use server";

import type { ActionResult } from "@/lib/actions/action-result";
import { requireUser } from "@/lib/auth/require-user";
import {
  focusV2PreferencesSchema,
  type FocusV2Preferences,
} from "./focus-v2-preferences";

export async function saveFocusV2PreferencesAction(
  input: FocusV2Preferences,
): Promise<ActionResult> {
  if (process.env.FOCUS_V2_ENABLED !== "true") {
    return { success: false, message: "Focus V2 is not enabled." };
  }

  const parsed = focusV2PreferencesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid Focus V2 preferences.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const { supabase, user } = await requireUser();
    const p = parsed.data;
    const { error } = await supabase.from("focus_user_preferences").upsert(
      {
        user_id: user.id,
        focus_minutes: p.focusMinutes,
        short_break_minutes: p.shortBreakMinutes,
        long_break_minutes: p.longBreakMinutes,
        round_count: p.roundCount,
        long_break_every: p.longBreakEvery,
        auto_start_breaks: p.autoStartBreaks,
        auto_start_focus: p.autoStartFocus,
      },
      { onConflict: "user_id" },
    );

    if (error) {
      return { success: false, message: "Unable to save Focus V2 preferences." };
    }

    return { success: true, message: "Focus V2 preferences saved.", data: null };
  } catch {
    return { success: false, message: "Unable to save Focus V2 preferences." };
  }
}
