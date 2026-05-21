import { requireUser } from "@/lib/auth/require-user";

export async function getActiveFocusSession() {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("focus_sessions")
    .select(
      `
      *,
      tasks (
        id,
        title,
        priority,
        status
      )
    `
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
      *,
      tasks (
        id,
        title,
        priority,
        status
      )
    `
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch focus sessions: ${error.message}`);
  }

  return data;
}