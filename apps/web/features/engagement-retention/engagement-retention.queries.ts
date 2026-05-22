import { requireUser } from "@/lib/auth/require-user";
import { recalculateEngagementForUser } from "@/features/engagement-retention/engagement-retention.server";
import { unstable_noStore as noStore } from "next/cache";

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
  if (!stats) return true;

  if (!stats.last_streak_evaluation_at) return true;

  const lastEvaluationDate = new Date(stats.last_streak_evaluation_at);
  const today = new Date();

  /*
    Recalculate automatically once per UTC day.
    This is enough to:
    - create first engagement stats row
    - detect missed days
    - freeze/lost streak when needed
    - avoid calling FastAPI on every page render
  */
  return !isSameUtcDate(lastEvaluationDate, today);
}

async function fetchCurrentEngagementStats(options?: { freshRead?: boolean }) {
  const { supabase, user } = await requireUser();

  let query = supabase
    .from("user_engagement_stats")
    .select("*")
    .eq("user_id", user.id);

  if (options?.freshRead) {
    // Use a distinct query signature after recalculation to avoid
    // request-level memoization returning the first stale/null read.
    query = query.order("updated_at", { ascending: false });
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch engagement stats: ${error.message}`);
  }

  return {
    user,
    stats: data,
  };
}

export async function getCurrentEngagementStats() {
  noStore();

  const { user, stats } = await fetchCurrentEngagementStats();

  if (!shouldRecalculateEngagement(stats)) {
    return stats;
  }

  try {
    console.log("[Engagement] Auto recalculating for user", user.id);
    await recalculateEngagementForUser(user.id);
  } catch (error) {
    console.error(
      "Failed to auto recalculate engagement on page access:",
      error,
    );

    /*
      If we already have old stats, show them instead of breaking layout.
      If this is a brand-new user with no stats, return null.
    */
    return stats;
  }

  const { stats: refreshedStats } = await fetchCurrentEngagementStats({
    freshRead: true,
  });

  return refreshedStats;
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
