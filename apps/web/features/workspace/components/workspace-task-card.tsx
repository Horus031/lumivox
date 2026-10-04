"use client";

import { CalendarClock, CheckSquare2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { formatDisplayDate } from "@/lib/utils/date";
import { getPriorityTone } from "@/lib/utils/color";
import type { WorkspaceTask } from "../workspace.types";

type WorkspaceTaskCardProps = {
  task: WorkspaceTask;
  onOpen: (task: WorkspaceTask) => void;
};

export function WorkspaceTaskCard({ task, onOpen }: WorkspaceTaskCardProps) {
  const t = useTranslations("workspace.board");
  const taskT = useTranslations("tasks.form");

  const completedSubtasks = task.subtasks.filter(
    (subtask) => subtask.status === "completed",
  ).length;

  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className="w-full rounded-[22px] border border-border/60 bg-background p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">
          {task.title}
        </h3>

        <Badge variant="secondary" className={getPriorityTone(task.priority)}>
          {taskT(`priorities.${task.priority}`)}
        </Badge>
      </div>

      {task.goals ? (
        <p className="mt-2 truncate text-xs text-muted-foreground">
          {task.goals.title}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {task.due_at ? (
          <span className="flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5" />

            {formatDisplayDate(task.due_at)}
          </span>
        ) : null}

        {task.subtasks.length > 0 ? (
          <span className="flex items-center gap-1">
            <CheckSquare2 className="h-3.5 w-3.5" />

            {t("subtaskProgress", {
              completed: completedSubtasks,
              total: task.subtasks.length,
            })}
          </span>
        ) : null}
      </div>
    </button>
  );
}
