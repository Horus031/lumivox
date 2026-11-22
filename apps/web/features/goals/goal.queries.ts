import { requireUser } from "@/lib/auth/require-user";
import { z } from "zod";
import type { GoalPage, GoalPageCursor, GoalWithProgress } from "./goal.types";

const GOALS_PAGE_SIZE = 20;

export async function getGoalPage({
  search = "",
  cursor = null,
  includeProgress = false,
}: { search?: string; cursor?: GoalPageCursor | null; includeProgress?: boolean } = {}): Promise<GoalPage> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("get_my_workspace_goal_page", {
    p_search: search,
    ...(cursor ? { p_before_created_at: cursor.created_at, p_before_id: cursor.id } : {}),
    p_include_progress: includeProgress,
  })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) throw new Error(`Failed to load goals: ${error.message}`);

  const rows = data ?? [];
  const items = rows.slice(0, GOALS_PAGE_SIZE);
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > GOALS_PAGE_SIZE && last
      ? { created_at: last.created_at, id: last.id }
      : null,
  };
}

export async function getGoalOptions() {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("goals")
    .select("id, title")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch goal options: ${error.message}`);
  }

  return data ?? [];
}

export async function getGoalById(goalId: string) {
  if (!z.guid().safeParse(goalId).success) return null;

  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .eq("id", goalId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch goal: ${error.message}`);
  }

  return data;
}

export async function getGoalsWithProgress(): Promise<GoalWithProgress[]> {
  const { supabase } = await requireUser();

  const { data, error } = await supabase.rpc("get_my_goals_with_progress");

  if (error) {
    throw new Error(`Failed to fetch goals with progress: ${error.message}`);
  }

  return (data ?? []) as unknown as GoalWithProgress[];
}
