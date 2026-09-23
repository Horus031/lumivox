import { requireUser } from "@/lib/auth/require-user";

export async function getActiveFocusSession() {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("focus_sessions")
    .select(
      `
      id,
      planned_minutes,
      started_at,
      total_paused_seconds,
      paused_at,
      status,
      tasks (
        id,
        title
      )
    `,
    )
    .in("status", ["ongoing", "paused"])
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch active focus session: ${error.message}`);
  }

  return data;
}

export async function getRecentFocusSessions(limit = 10) {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("focus_sessions")
    .select(
      `
      id,
      planned_minutes,
      actual_focus_minutes,
      status,
      tasks (
        id,
        title
      )
    `,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch focus sessions: ${error.message}`);
  }

  return data ?? [];
}
