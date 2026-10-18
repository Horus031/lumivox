import { requireUser } from "@/lib/auth/require-user";
import {
  DEFAULT_FOCUS_V2_PREFERENCES,
  focusV2PreferencesSchema,
  type FocusV2Preferences,
} from "./focus-v2-preferences";

// Called only when FOCUS_V2_ENABLED is true and no active session is open.
// The session-scoped Supabase client enforces RLS.
export async function getFocusV2Preferences(): Promise<FocusV2Preferences> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("focus_user_preferences")
    .select(
      "focus_minutes,short_break_minutes,long_break_minutes,round_count,long_break_every,auto_start_breaks,auto_start_focus",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw new Error("Unable to load Focus V2 preferences.");
  if (!data) return { ...DEFAULT_FOCUS_V2_PREFERENCES };

  return focusV2PreferencesSchema.parse({
    focusMinutes: data.focus_minutes,
    shortBreakMinutes: data.short_break_minutes,
    longBreakMinutes: data.long_break_minutes,
    roundCount: data.round_count,
    longBreakEvery: data.long_break_every,
    autoStartBreaks: data.auto_start_breaks,
    autoStartFocus: data.auto_start_focus,
  });
}
