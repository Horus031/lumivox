import { requireUser } from "@/lib/auth/require-user";
import { GoalWithProgress } from "./goal.types";
import { calculateGoalProgress } from "./goal-progress.utils";

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

export async function getGoalsWithProgress(): Promise<GoalWithProgress[]> {
  const { supabase, user } = await requireUser();

  const { data: goals, error: goalsError } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (goalsError) {
    throw new Error(`Failed to fetch goals: ${goalsError.message}`);
  }

  const goalRows = goals ?? [];

  if (goalRows.length === 0) {
    return [];
  }

  const goalIds = goalRows.map((goal) => goal.id);

  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id, goal_id, status")
    .eq("user_id", user.id)
    .in("goal_id", goalIds)
    // .is("deleted_at", null);

  if (tasksError) {
    throw new Error(`Failed to fetch goal tasks: ${tasksError.message}`);
  }

  const taskRows = tasks ?? [];

  const taskCountByGoalId = new Map<string, number>();
  const completedTaskCountByGoalId = new Map<string, number>();

  for (const task of taskRows) {
    if (!task.goal_id) continue;

    const currentTotal = taskCountByGoalId.get(task.goal_id) ?? 0;
    taskCountByGoalId.set(task.goal_id, currentTotal + 1);

    if (task.status === "completed") {
      const currentCompleted =
        completedTaskCountByGoalId.get(task.goal_id) ?? 0;

      completedTaskCountByGoalId.set(task.goal_id, currentCompleted + 1);
    }
  }

  return goalRows.map((goal) => {
    const totalTasks = taskCountByGoalId.get(goal.id) ?? 0;
    const completedTasks = completedTaskCountByGoalId.get(goal.id) ?? 0;

    return {
      ...goal,
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      computed_progress: calculateGoalProgress({
        totalTasks,
        completedTasks,
      }),
    };
  });
}
