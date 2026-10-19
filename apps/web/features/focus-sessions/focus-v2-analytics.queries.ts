import { requireUser } from "@/lib/auth/require-user";
import {
  buildFocusV2AnalyticsReport,
  getUtcAnalyticsWindow,
  type FocusAnalyticsDistraction,
  type FocusAnalyticsReward,
  type FocusAnalyticsSegment,
  type FocusAnalyticsSession,
  type FocusV2AnalyticsReport,
} from "./focus-v2-analytics.model";

const PAGE_SIZE = 500;
const MAX_ROWS_PER_TABLE = 3000;
const IN_CHUNK_SIZE = 60;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

async function readPages<T>(
  fetchPage: (from: number, to: number) => Promise<PageResult<T>>,
  maxRows = MAX_ROWS_PER_TABLE,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Focus analytics query failed: ${error.message}`);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return { rows, truncated: false };
  }
  // A full final page is conservatively marked potentially truncated.
  return { rows, truncated: true };
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

export async function getFocusV2Analytics(days: 7 | 30 = 30): Promise<FocusV2AnalyticsReport> {
  if (process.env.FOCUS_V2_ENABLED !== "true") throw new Error("Focus V2 is disabled");
  const { supabase, user } = await requireUser();
  const { startUtc, endUtcExclusive } = getUtcAnalyticsWindow(new Date(), days);

  const sessionsResult = await readPages<FocusAnalyticsSession>(async (from, to) => {
    const { data, error } = await supabase.from("focus_sessions")
      .select("id,task_id,session_mode,status,planned_minutes,actual_focus_minutes,total_paused_seconds,started_at")
      .eq("user_id", user.id)
      .gte("started_at", startUtc)
      .lt("started_at", endUtcExclusive)
      .order("started_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);
    return { data, error };
  });
  const sessionIds = sessionsResult.rows.map(row => row.id);
  const segments: FocusAnalyticsSegment[] = [];
  const distractions: FocusAnalyticsDistraction[] = [];
  let truncated = sessionsResult.truncated;
  for (const ids of chunks(sessionIds, IN_CHUNK_SIZE)) {
    const s = await readPages<FocusAnalyticsSegment>(async (from, to) => {
      const { data, error } = await supabase.from("focus_session_segments")
        .select("session_id,segment_kind,status,actual_seconds,total_paused_seconds")
        .in("session_id", ids)
        .order("session_id", { ascending: true })
        .order("position", { ascending: true })
        .range(from, to);
      return { data, error };
    });
    segments.push(...s.rows);
    truncated ||= s.truncated;
    const d = await readPages<FocusAnalyticsDistraction>(async (from, to) => {
      const { data, error } = await supabase.from("distraction_events")
        .select("session_id,distraction_type,duration_seconds")
        .eq("user_id", user.id)
        .in("session_id", ids)
        .order("id", { ascending: true })
        .range(from, to);
      return { data, error };
    });
    distractions.push(...d.rows);
    truncated ||= d.truncated;
  }

  const [engagementResult, rewardsResult] = await Promise.all([
    supabase.from("user_engagement_stats")
      .select("current_streak_days,longest_streak_days,token_balance,completed_focus_sessions_total")
      .eq("user_id", user.id).maybeSingle(),
    readPages<FocusAnalyticsReward>(async (from, to) => {
      const { data, error } = await supabase.from("reward_ledger")
        .select("id,token_delta")
        .eq("user_id", user.id)
        .eq("event_type", "focus_session_completed")
        .gte("occurred_at", startUtc)
        .lt("occurred_at", endUtcExclusive)
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
      return { data, error };
    }),
  ]);
  if (engagementResult.error) throw new Error(`Focus engagement query failed: ${engagementResult.error.message}`);
  truncated ||= rewardsResult.truncated;

  const taskIds = [...new Set(sessionsResult.rows.map(row => row.task_id).filter((id): id is string => id !== null))];
  const taskNames: Record<string, string> = {};
  for (const ids of chunks(taskIds, IN_CHUNK_SIZE)) {
    const { data, error } = await supabase.from("tasks")
      .select("id,title").eq("user_id", user.id).in("id", ids).order("id").range(0, ids.length - 1);
    if (error) throw new Error(`Focus task query failed: ${error.message}`);
    for (const task of data ?? []) taskNames[task.id] = task.title;
  }

  return buildFocusV2AnalyticsReport({
    sessions: sessionsResult.rows,
    segments,
    distractions,
    rewards: rewardsResult.rows,
    engagement: engagementResult.data,
    taskNames,
    startUtc,
    days,
    truncated,
  });
}
