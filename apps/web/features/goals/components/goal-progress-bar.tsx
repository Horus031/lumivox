import { calculateGoalProgress } from "@/features/goals/goal-progress.utils";
import { useTranslations } from "next-intl";

type GoalProgressBarProps = {
  totalTasks: number;
  completedTasks: number;
};

export function GoalProgressBar({
  totalTasks,
  completedTasks,
}: GoalProgressBarProps) {
  const t = useTranslations("goals.progress");
  const progress = calculateGoalProgress({
    totalTasks,
    completedTasks,
  });

  const label =
    totalTasks <= 0
      ? t("noTasks")
      : t("tasksCompleted", { completed: completedTasks, total: totalTasks });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-neutral-700 dark:text-neutral-300">
          {t("label")}
        </span>

        <span className="text-neutral-500 dark:text-neutral-400">
          {progress}%
        </span>
      </div>

      <div className="h-2.5 overflow-hidden rounded-full bg-muted-foreground ">
        <div
          className="h-full rounded-full bg-primary transition-all "
          style={{
            width: `${progress}%`,
          }}
        />
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">{label}</p>
    </div>
  );
}
