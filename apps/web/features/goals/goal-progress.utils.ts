export type GoalProgressInput = {
  totalTasks: number;
  completedTasks: number;
};

export function calculateGoalProgress({
  totalTasks,
  completedTasks,
}: GoalProgressInput) {
  if (totalTasks <= 0) {
    return 0;
  }

  const rawProgress = (completedTasks / totalTasks) * 100;

  return Math.min(100, Math.max(0, Math.round(rawProgress)));
}

export function formatGoalProgressLabel({
  totalTasks,
  completedTasks,
}: GoalProgressInput) {
  if (totalTasks <= 0) {
    return "No tasks yet";
  }

  return `${completedTasks}/${totalTasks} tasks completed`;
}