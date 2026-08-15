import { requireUser } from "@/lib/auth/require-user";
import { getCurrentWeekRange } from "../study-groups/study-group-date.utils";

export async function getGlobalWeeklyLeaderboard() {
  const { supabase } = await requireUser();
  const { weekStart, weekEnd } = getCurrentWeekRange();

  const { data, error } = await supabase.rpc(
    "get_global_weekly_leaderboard",
    {
      p_week_start: weekStart,
      p_week_end: weekEnd,
      p_limit: 20,
    }
  );

  if (error) {
    throw new Error(`Failed to fetch global leaderboard: ${error.message}`);
  }

  return {
    weekStart,
    weekEnd,
    rows: data ?? [],
  };
}

export async function getMyGlobalWeeklyRank() {
  const { supabase } = await requireUser();
  const { weekStart, weekEnd } = getCurrentWeekRange();

  const { data, error } = await supabase.rpc(
    "get_my_global_weekly_rank",
    {
      p_week_start: weekStart,
      p_week_end: weekEnd,
    }
  );

  if (error) {
    throw new Error(`Failed to fetch my global rank: ${error.message}`);
  }

  return data?.[0] ?? null;
}