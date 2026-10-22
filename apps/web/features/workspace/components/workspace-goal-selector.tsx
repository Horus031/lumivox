"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { GoalWithProgress } from "@/features/goals/goal.types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkspaceGoalActions } from "./workspace-goal-actions";

export function WorkspaceGoalSelector({
  goals,
  selectedKey,
}: {
  goals: GoalWithProgress[];
  selectedKey: string;
}) {
  const t = useTranslations("workspace.rail");
  const router = useRouter();
  const selectedGoal = goals.find((goal) => goal.id === selectedKey);

  return (
    <div className="min-w-0 lg:hidden">
      <div className="flex min-w-0 items-center gap-2">
        <Select value={selectedKey} onValueChange={(key) => router.push(`/workspace?goal=${encodeURIComponent(key)}`)}>
          <SelectTrigger aria-label={t("title")} className="w-full min-w-0 sm:h-touch">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="w-[var(--radix-select-trigger-width)]">
            <SelectItem value="all">{t("allTasks")}</SelectItem>
            <SelectItem value="unassigned">{t("unassigned")}</SelectItem>
            {goals.map((goal) => (
              <SelectItem key={goal.id} value={goal.id} className="whitespace-normal">
                <span className="min-w-0 [overflow-wrap:anywhere]">{goal.title}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedGoal ? <WorkspaceGoalActions goal={selectedGoal} /> : null}
      </div>
      {selectedGoal ? (
        <p className="mt-2 text-caption text-muted-foreground">
          {t("taskProgress", { completed: selectedGoal.completed_tasks, total: selectedGoal.total_tasks })}
        </p>
      ) : null}
    </div>
  );
}
