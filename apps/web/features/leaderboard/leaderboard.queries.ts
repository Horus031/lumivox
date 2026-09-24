import { requireUser } from "@/lib/auth/require-user";
import { getCurrentWeekRange } from "../study-groups/study-group-date.utils";

type GlobalLeaderboardRow = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  focus_minutes: number;
  completed_tasks: number;
  focus_sessions: number;
  current_streak: number;
  score: number;
  rank_position: number;
};

type MyGlobalRank = Omit<GlobalLeaderboardRow, "avatar_url">;

type GlobalLeaderboardBundleRpc = {
  rows: GlobalLeaderboardRow[];
  myRank: MyGlobalRank | null;
};

export async function getGlobalWeeklyLeaderboardBundle() {
  const { supabase } = await requireUser();
  const { weekStart, weekEnd } = getCurrentWeekRange();

  const { data, error } = await supabase.rpc(
    "get_global_weekly_leaderboard_bundle",
    {
      p_week_start: weekStart,
      p_week_end: weekEnd,
      p_limit: 20,
    },
  );

  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(
      `Failed to fetch global leaderboard: ${error?.message ?? "Invalid response"}`,
    );
  }

  const bundle = data as unknown as GlobalLeaderboardBundleRpc;

  return {
    weekStart,
    weekEnd,
    rows: bundle.rows ?? [],
    myRank: bundle.myRank ?? null,
  };
}
