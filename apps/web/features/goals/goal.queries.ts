import { requireUser } from "@/lib/auth/require-user";
import type { GoalWithProgress } from "./goal.types";

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
