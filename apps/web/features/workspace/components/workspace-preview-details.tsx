"use client";

import { useRouter } from "@/i18n/navigation";
import { TaskDetailsDrawer, type TaskDrawerTab } from "@/features/tasks/components/task-details-drawer";
import type { TaskWithGoal } from "@/features/tasks/task.types";
import type { GoalOption } from "@/features/goals/goal.types";

export function WorkspacePreviewDetails({
  task,
  goals,
  closeHref,
  tab,
  edit,
}: {
  task: TaskWithGoal;
  goals: GoalOption[];
  closeHref: string;
  tab?: TaskDrawerTab;
  edit: boolean;
}) {
  const router = useRouter();

  return (
    <TaskDetailsDrawer
      task={task}
      goals={goals}
      searchableGoals
      initialTab={tab}
      initialEditMode={edit}
      onClose={() => router.replace(closeHref, { scroll: false })}
    />
  );
}
