"use client";

import { useDraggable } from "@dnd-kit/react";
import { ArrowRightLeft, CalendarClock, CheckSquare2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { MouseEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DirectTaskStatus } from "@/features/tasks/task-transition";
import { formatDisplayDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils";
import type { WorkspaceTask } from "../workspace.types";
import { TaskRiskIndicator } from "@/features/native-task-risk/components/task-risk-indicator";

import type { TaskRiskViewState } from "@/features/native-task-risk/task-risk-presentation.types";

type WorkspaceTaskCardProps = {
  task: WorkspaceTask;
  onPointerDown: () => void;
  onOpen: (task: WorkspaceTask, event: MouseEvent<HTMLButtonElement>) => void;
  onMove: (taskId: string, targetStatus: DirectTaskStatus) => void;
  moveTargets: readonly DirectTaskStatus[];
  disabled?: boolean;
  riskState: TaskRiskViewState;
};

const PRIORITY_TONES = {
  critical: "border-danger/30 bg-danger/10 text-foreground",
  high: "border-warning/30 bg-warning/10 text-foreground",
  medium: "border-info/30 bg-info/10 text-foreground",
  low: "border-border bg-muted text-secondary-text",
};

export function WorkspaceTaskCard({
  task,
  onPointerDown,
  onOpen,
  onMove,
  moveTargets,
  disabled = false,
  riskState,
}: WorkspaceTaskCardProps) {
  const t = useTranslations("workspace.board");
  const taskT = useTranslations("tasks.form");
  const canMove = moveTargets.length > 0;
  const draggable = useDraggable({
    id: `task:${task.id}`,
    type: "workspace-task",
    disabled: disabled || !canMove,
  });

  const showRiskIndicator =
    riskState.status === "stale" ||
    riskState.status === "loading" ||
    (riskState.status === "ready" && riskState.alert.risk_band !== "low");

  return (
    <article
      ref={draggable.ref}
      data-dragging={draggable.isDragging || undefined}
      className={cn(
        "relative w-full min-w-0 rounded-lg border border-border bg-card text-left transition-colors hover:border-ring/40",
        draggable.isDragging && "opacity-60",
      )}
    >
      <button
        ref={draggable.handleRef}
        type="button"
        aria-label={task.title}
        onPointerDownCapture={(event) => {
          if (event.isPrimary && event.button === 0) onPointerDown();
        }}
        onClick={(event) => onOpen(task, event)}
        className={cn(
          "block min-h-touch w-full rounded-lg p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          canMove && !disabled && "cursor-grab active:cursor-grabbing select-none",
        )}
      >
        <h3
          title={task.title}
          className={cn(
            "min-h-touch text-body font-medium text-foreground line-clamp-2 [overflow-wrap:anywhere] lg:min-h-control-sm",
            canMove && "pr-10",
          )}
        >
          {task.title}
        </h3>

        <div className="mt-2 flex min-w-0 items-center gap-2">
          <Badge
            variant="secondary"
            className={cn("shrink-0", PRIORITY_TONES[task.priority])}
          >
            {taskT(`priorities.${task.priority}`)}
          </Badge>
          {task.goals ? (
            <p
              title={task.goals.title}
              className="min-w-0 truncate text-caption text-muted-foreground"
            >
              {task.goals.title}
            </p>
          ) : null}
        </div>

        {task.due_at || task.totalSubtasks > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-caption text-muted-foreground">
            {task.due_at ? (
              <span className="flex items-center gap-1">
                <CalendarClock
                  aria-hidden="true"
                  className="size-icon-sm shrink-0"
                />

                {formatDisplayDate(task.due_at)}
              </span>
            ) : null}

            {task.totalSubtasks > 0 ? (
              <span className="flex items-center gap-1">
                <CheckSquare2
                  aria-hidden="true"
                  className="size-icon-sm shrink-0"
                />

                {t("subtaskProgress", {
                  completed: task.completedSubtasks,
                  total: task.totalSubtasks,
                })}
              </span>
            ) : null}
          </div>
        ) : null}

        {showRiskIndicator ? (
          <div className="mt-2 flex min-w-0">
            <TaskRiskIndicator state={riskState} />
          </div>
        ) : null}
      </button>

      {canMove && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label={t("moveTask", { title: task.title })}
              title={t("moveTaskAction")}
              className="absolute right-1 top-1 size-touch text-muted-foreground lg:size-control-sm"
            >
              <ArrowRightLeft aria-hidden="true" className="size-icon" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {moveTargets.map((status) => (
              <DropdownMenuItem key={status} onSelect={() => onMove(task.id, status)}>
                {taskT(`statuses.${status}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </article>
  );
}
