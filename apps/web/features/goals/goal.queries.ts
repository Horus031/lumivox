import { requireUser } from "@/lib/auth/require-user";

export async function getGoals() {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch goals: ${error.message}`);
  }

  return data;
}

export async function getGoalById(goalId: string) {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .eq("id", goalId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch goal: ${error.message}`);
  }

  return data;
}