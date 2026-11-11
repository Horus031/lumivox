"use client";

import { useDraggable } from "@dnd-kit/react";
import { CalendarClock, CheckSquare2, GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { formatDisplayDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils";
import type { WorkspaceTask } from "../workspace.types";

type WorkspaceTaskCardProps = {
  task: WorkspaceTask;
  onOpen: (task: WorkspaceTask) => void;
  disabled?: boolean;
};

const PRIORITY_TONES = {
  critical: "border-danger/30 bg-danger/10 text-foreground",
  high: "border-warning/30 bg-warning/10 text-foreground",
  medium: "border-info/30 bg-info/10 text-foreground",
  low: "border-border bg-muted text-secondary-text",
};

export function WorkspaceTaskCard({
  task,
  onOpen,
  disabled = false,
}: WorkspaceTaskCardProps) {
  return <WorkspaceSummaryCard
    task={task}
    goalTitle={task.goals?.title}
    subtaskCount={task.subtasks.length}
    completedSubtasks={task.subtasks.filter((subtask) => subtask.status === "completed").length}
    onOpen={() => onOpen(task)}
    disabled={disabled}
  />;
}

export function WorkspaceSummaryCard({
  task, goalTitle, subtaskCount, completedSubtasks, onOpen, disabled = false,
}: {
  task: Pick<WorkspaceTask, "id" | "title" | "priority" | "due_at">;
  goalTitle?: string | null;
  subtaskCount: number;
  completedSubtasks: number;
  onOpen: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations("workspace.board");
  const taskT = useTranslations("tasks.form");
  const draggable = useDraggable({
    id: `task:${task.id}`,
    type: "workspace-task",
    disabled,
    data: { taskId: task.id },
  });

  return (
    <article
      ref={draggable.ref}
      className={cn(
        "relative w-full min-w-0 rounded-lg border border-border bg-card text-left transition-colors hover:border-ring/40",
        draggable.isDragging && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="block min-h-touch w-full rounded-lg p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <h3 title={task.title} className="min-h-touch pr-10 text-body font-medium text-foreground line-clamp-2 [overflow-wrap:anywhere] lg:min-h-control-sm">
          {task.title}
        </h3>

        <div className="mt-2 flex min-w-0 items-center gap-2">
          <Badge variant="secondary" className={cn("shrink-0", PRIORITY_TONES[task.priority])}>
            {taskT(`priorities.${task.priority}`)}
          </Badge>
          {goalTitle ? (
            <p title={goalTitle} className="min-w-0 truncate text-caption text-muted-foreground">
              {goalTitle}
            </p>
          ) : null}
        </div>

        {(task.due_at || subtaskCount > 0) ? <div className="mt-2 flex flex-wrap items-center gap-3 text-caption text-muted-foreground">
          {task.due_at ? (
            <span className="flex items-center gap-1">
              <CalendarClock aria-hidden="true" className="size-icon-sm shrink-0" />

              {formatDisplayDate(task.due_at)}
            </span>
          ) : null}

          {subtaskCount > 0 ? (
            <span className="flex items-center gap-1">
              <CheckSquare2 aria-hidden="true" className="size-icon-sm shrink-0" />

              {t("subtaskProgress", {
                completed: completedSubtasks,
                total: subtaskCount,
              })}
            </span>
          ) : null}
        </div> : null}
      </button>
      <button
        ref={draggable.handleRef}
        type="button"
        disabled={disabled}
        aria-label={t("dragTask")}
        title={t("dragTask")}
        className="absolute right-1 top-1 flex size-touch touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 cursor-grab active:cursor-grabbing lg:size-control-sm"
      >
        <GripVertical aria-hidden="true" className="size-icon" />
      </button>
    </article>
  );
}
