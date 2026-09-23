import { scheduleEngagementRecalculation } from "@/features/engagement-retention/engagement-retention.background";
import { requireUser } from "@/lib/auth/require-user";

function isSameUtcDate(a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function shouldRecalculateEngagement(
  stats: {
    last_streak_evaluation_at: string | null;
  } | null,
) {
  if (!stats?.last_streak_evaluation_at) return true;

  return !isSameUtcDate(new Date(stats.last_streak_evaluation_at), new Date());
}

async function fetchCurrentEngagementStats() {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("user_engagement_stats")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch engagement stats: ${error.message}`);
  }

  return {
    user,
    stats: data,
  };
}

export async function getCurrentEngagementStats() {
  const { user, stats } = await fetchCurrentEngagementStats();

  if (shouldRecalculateEngagement(stats)) {
    scheduleEngagementRecalculation({
      userId: user.id,
      source: "stale-read",
    });
  }

  // Never make page rendering wait for FastAPI. Existing stats are rendered
  // immediately and Supabase Realtime updates the client after recalculation.
  return stats;
}

export async function getRecentRewardLedgerEntries(limit = 5) {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("reward_ledger")
    .select("*")
    .eq("user_id", user.id)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(
      `Failed to fetch recent reward ledger entries: ${error.message}`,
    );
  }

  return data ?? [];
}

export async function getRecentStreakEvents(limit = 5) {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("user_streak_events")
    .select("*")
    .eq("user_id", user.id)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch recent streak events: ${error.message}`);
  }

  return data ?? [];
}
