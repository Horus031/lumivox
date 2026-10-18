import { requireUser } from "@/lib/auth/require-user";
import type { FocusV2Snapshot } from "./focus-v2.types";

// All reads use the caller's authenticated Supabase client; RLS is mandatory.
export async function getFocusV2Snapshot(sessionId: string): Promise<FocusV2Snapshot | null> {
  const { supabase, user } = await requireUser();
  const parentResult = await supabase
    .from("focus_sessions")
    .select("id,user_id,task_id,session_mode,status,planned_minutes,actual_focus_minutes,started_at,ended_at")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .eq("session_mode", "pomodoro")
    .maybeSingle();
  if (parentResult.error) throw new Error("Unable to load Focus V2 session.");
  if (!parentResult.data) return null;

  const [planResult, segmentResult] = await Promise.all([
    supabase.from("focus_session_plans").select("*").eq("session_id", sessionId).maybeSingle(),
    supabase.from("focus_session_segments").select("*").eq("session_id", sessionId).order("position"),
  ]);
  if (planResult.error || segmentResult.error || !planResult.data || !segmentResult.data?.length) {
    throw new Error("Focus V2 session data is incomplete.");
  }
  return {
    session: parentResult.data,
    plan: planResult.data,
    segments: segmentResult.data,
    serverObservedAt: new Date().toISOString(),
  };
}

export async function getActiveFocusV2Snapshot(): Promise<FocusV2Snapshot | null> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("focus_sessions")
    .select("id")
    .eq("user_id", user.id)
    .eq("session_mode", "pomodoro")
    .in("status", ["ongoing", "paused"])
    .maybeSingle();
  if (error) throw new Error("Unable to load active Focus V2 session.");
  return data ? getFocusV2Snapshot(data.id) : null;
}
