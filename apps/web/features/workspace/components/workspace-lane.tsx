"use client";

import { useTranslations } from "next-intl";
import { useDroppable } from "@dnd-kit/react";
import { LockKeyhole } from "lucide-react";
import { isDirectTaskStatusTarget } from "@/features/tasks/task-transition";
import { cn } from "@/lib/utils";

import type { TaskStatus } from "@/features/tasks/task-status";
import type { WorkspaceTask } from "../workspace.types";
import { WorkspaceTaskCard } from "./workspace-task-card";
import { WorkspaceQuickCreateTask } from "./workspace-quick-create-task";

type WorkspaceLaneProps = {
  status: TaskStatus;
  label: string;
  tasks: WorkspaceTask[];
  onOpenTask: (task: WorkspaceTask) => void;
  disabled: boolean;
  quickCreateGoalId: string | null;
};

export function WorkspaceLane({
  status,
  label,
  tasks,
  onOpenTask,
  disabled,
  quickCreateGoalId,
}: WorkspaceLaneProps) {
  const t = useTranslations("workspace.board");
  const droppable = useDroppable({
    id: `lane:${status}`,
    type: "workspace-lane",
    accept: "workspace-task",
    disabled: disabled || !isDirectTaskStatusTarget(status),
    data: { status },
  });

  return (
    <section
      ref={droppable.ref}
      data-status={status}
      className={cn(
        "flex h-fit min-h-56 w-64 max-w-full shrink-0 flex-col",
        droppable.isDropTarget && "rounded-lg bg-muted ring-2 ring-ring",
      )}
    >
      <header className="mb-3 flex min-h-control items-center justify-between gap-3 border-b border-border pb-2">
        <h2 className="min-w-0 text-label font-semibold text-foreground">{label}</h2>

        <span className="shrink-0 text-caption font-medium text-muted-foreground tabular-nums">
          {tasks.length}
        </span>
      </header>

      {(status === "in_review" || status === "overdue") && (
        <p className="mb-3 flex items-start gap-1.5 text-caption text-muted-foreground">
          <LockKeyhole aria-hidden="true" className="mt-0.5 size-icon-sm shrink-0" />
          {t(status === "in_review" ? "reviewManaged" : "overdueManaged")}
        </p>
      )}
      {status === "todo" && (
        <WorkspaceQuickCreateTask
          key={quickCreateGoalId ?? "unassigned"}
          goalId={quickCreateGoalId}
        />
      )}

      <div className="space-y-2">
        {tasks.length ? (
          tasks.map((task) => (
            <WorkspaceTaskCard
              key={task.id}
              task={task}
              onOpen={onOpenTask}
              disabled={disabled || status === "in_review"}
            />
          ))
        ) : (
          <div className="py-6 text-center text-caption text-muted-foreground">
            {t("empty")}
          </div>
        )}
      </div>
    </section>
  );
}
