import { requireUser } from "@/lib/auth/require-user";

export async function getCmsSetting<T>(
  key: string,
  fallback: T,
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

async function getCmsSettings<T extends Record<string, unknown>>(
  keys: string[],
  fallbacks: T,
): Promise<T> {
  const { supabase } = await requireUser();

  const { data, error } = await supabase.rpc("get_cms_settings", {
    p_keys: keys,
  });

  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return fallbacks;
  }

  const values = data as Record<string, unknown>;

  return Object.fromEntries(
    Object.entries(fallbacks).map(([key, fallback]) => [
      key,
      values[key] ?? fallback,
    ]),
  ) as T;
}

export async function getLeaderboardSettings() {
  const values = await getCmsSettings(
    ["global_leaderboard_enabled", "group_leaderboard_enabled"],
    {
      global_leaderboard_enabled: true,
      group_leaderboard_enabled: true,
    },
  );

  return {
    globalLeaderboardEnabled: values.global_leaderboard_enabled,
    groupLeaderboardEnabled: values.group_leaderboard_enabled,
  };
}

export async function getRagDefaultSettings() {
  const values = await getCmsSettings(
    ["default_rag_top_k", "default_rag_prompt_variant"],
    {
      default_rag_top_k: 5,
      default_rag_prompt_variant: "grounded_rule" as
        | "grounded_rule"
        | "no_rule",
    },
  );

  return {
    defaultTopK: values.default_rag_top_k,
    defaultPromptVariant: values.default_rag_prompt_variant,
  };
}

export async function getWeeklyChallengeDefaultSettings() {
  const values = await getCmsSettings(
    [
      "weekly_challenge_default_focus_minutes",
      "weekly_challenge_default_completed_tasks",
    ],
    {
      weekly_challenge_default_focus_minutes: 300,
      weekly_challenge_default_completed_tasks: 10,
    },
  );

  return {
    defaultFocusMinutes: values.weekly_challenge_default_focus_minutes,
    defaultCompletedTasks: values.weekly_challenge_default_completed_tasks,
  };
}
