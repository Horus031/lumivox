import { requireUser } from "@/lib/auth/require-user";
import { GoalWithProgress } from "./goal.types";
import { calculateGoalProgress } from "./goal-progress.utils";

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
  const { supabase, user } = await requireUser();

  const [goalsResult, tasksResult] = await Promise.all([
    supabase
      .from("goals")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("goal_id, status")
      .eq("user_id", user.id)
      .not("goal_id", "is", null),
  ]);

  if (goalsResult.error) {
    throw new Error(`Failed to fetch goals: ${goalsResult.error.message}`);
  }

  if (tasksResult.error) {
    throw new Error(
      `Failed to fetch goal tasks: ${tasksResult.error.message}`,
    );
  }

  const goalRows = goalsResult.data ?? [];

  if (goalRows.length === 0) {
    return [];
  }

  const taskRows = tasksResult.data ?? [];

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
