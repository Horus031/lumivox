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
        "flex h-fit min-h-56 w-[18rem] shrink-0 flex-col rounded-[28px] border border-border/60 bg-muted/30 p-3 xl:w-76",
        droppable.isDropTarget && "ring-2 ring-primary/40",
      )}
    >
      <header className="mb-3 flex items-center justify-between gap-3 px-1">
        <h2 className="text-sm font-semibold text-foreground">{label}</h2>

        <span className="rounded-full bg-background px-2 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border/60">
          {tasks.length}
        </span>
      </header>

      {(status === "in_review" || status === "overdue") && (
        <p className="mb-3 flex items-start gap-1.5 px-1 text-xs text-muted-foreground">
          <LockKeyhole className="mt-0.5 h-3 w-3 shrink-0" />
          {t(status === "in_review" ? "reviewManaged" : "overdueManaged")}
        </p>
      )}
      {status === "todo" && (
        <WorkspaceQuickCreateTask
          key={quickCreateGoalId ?? "unassigned"}
          goalId={quickCreateGoalId}
        />
      )}

      <div className="space-y-3">
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
          <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
            {t("empty")}
          </div>
        )}
      </div>
    </section>
  );
}
