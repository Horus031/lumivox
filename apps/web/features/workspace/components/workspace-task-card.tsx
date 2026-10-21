"use client";

import { useDraggable } from "@dnd-kit/react";
import { CalendarClock, CheckSquare2, GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { formatDisplayDate } from "@/lib/utils/date";
import { getPriorityTone } from "@/lib/utils/color";
import { cn } from "@/lib/utils";
import type { WorkspaceTask } from "../workspace.types";

type WorkspaceTaskCardProps = {
  task: WorkspaceTask;
  onOpen: (task: WorkspaceTask) => void;
  disabled?: boolean;
};

export function WorkspaceTaskCard({
  task,
  onOpen,
  disabled = false,
}: WorkspaceTaskCardProps) {
  const t = useTranslations("workspace.board");
  const taskT = useTranslations("tasks.form");
  const draggable = useDraggable({
    id: `task:${task.id}`,
    type: "workspace-task",
    disabled,
    data: { taskId: task.id },
  });

  const completedSubtasks = task.subtasks.filter(
    (subtask) => subtask.status === "completed",
  ).length;

  return (
    <article
      ref={draggable.ref}
      className={cn(
        "relative w-full rounded-[22px] border border-border/60 bg-background text-left shadow-sm transition hover:shadow-md",
        draggable.isDragging && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(task)}
        className="block w-full rounded-[22px] p-4 pr-10 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      <button
        ref={draggable.handleRef}
        type="button"
        disabled={disabled}
        aria-label={t("dragTask")}
        title={t("dragTask")}
        className="absolute right-1 top-2 flex h-8 w-8 touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
    </article>
  );
}
