import { requireUser } from "@/lib/auth/require-user";

export async function getCmsSetting<T>(
  key: string,
  fallback: T
): Promise<T> {
  const { supabase } = await requireUser();

  const { data, error } = await supabase.rpc("get_cms_setting", {
    p_key: key,
  });

  if (error || data === null || data === undefined) {
    return fallback;
  }

  return data as T;
}

export async function getLeaderboardSettings() {
  const [globalLeaderboardEnabled, groupLeaderboardEnabled] =
    await Promise.all([
      getCmsSetting<boolean>("global_leaderboard_enabled", true),
      getCmsSetting<boolean>("group_leaderboard_enabled", true),
    ]);

  return {
    globalLeaderboardEnabled,
    groupLeaderboardEnabled,
  };
}

export async function getRagDefaultSettings() {
  const [defaultTopK, defaultPromptVariant] = await Promise.all([
    getCmsSetting<number>("default_rag_top_k", 5),
    getCmsSetting<"grounded_rule" | "no_rule">(
      "default_rag_prompt_variant",
      "grounded_rule"
    ),
  ]);

  return {
    defaultTopK,
    defaultPromptVariant,
  };
}

export async function getWeeklyChallengeDefaultSettings() {
  const [defaultFocusMinutes, defaultCompletedTasks] = await Promise.all([
    getCmsSetting<number>("weekly_challenge_default_focus_minutes", 300),
    getCmsSetting<number>("weekly_challenge_default_completed_tasks", 10),
  ]);

  return {
    defaultFocusMinutes,
    defaultCompletedTasks,
  };
}