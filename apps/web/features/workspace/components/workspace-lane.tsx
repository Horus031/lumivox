"use client";

import { useTranslations } from "next-intl";
import { useDroppable } from "@dnd-kit/react";
import { ChevronLeft, ChevronRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isDirectTaskStatusTarget } from "@/features/tasks/task-transition";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import type { TaskStatus } from "@/features/tasks/task-status";
import type { WorkspaceTask } from "../workspace.types";
import { WorkspaceTaskCard } from "./workspace-task-card";
import { WorkspaceQuickCreateTask } from "./workspace-quick-create-task";
import type { TaskRiskViewState } from "@/features/native-task-risk/task-risk-presentation.types";

type WorkspaceLaneProps = {
  status: TaskStatus;
  label: string;
  tasks: WorkspaceTask[];
  total: number;
  pagination?: { page: number; totalPages: number; previousHref?: string; nextHref?: string };
  onOpenTask: (task: WorkspaceTask) => void;
  disabled: boolean;
  quickCreateGoalId: string | null;
  quickCreateBoardHref?: string;
  riskStateForTask: (task: WorkspaceTask) => TaskRiskViewState;
};

export function WorkspaceLane({
  status,
  label,
  tasks,
  total,
  pagination,
  onOpenTask,
  disabled,
  quickCreateGoalId,
  quickCreateBoardHref,
  riskStateForTask,
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
        <h2 className="min-w-0 text-label font-semibold text-foreground">
          {label}
        </h2>

        <span className="shrink-0 text-caption font-medium text-muted-foreground tabular-nums">
          {total}
        </span>
      </header>

      {(status === "in_review" || status === "overdue") && (
        <p className="mb-3 flex items-start gap-1.5 text-caption text-muted-foreground">
          <LockKeyhole
            aria-hidden="true"
            className="mt-0.5 size-icon-sm shrink-0"
          />
          {t(status === "in_review" ? "reviewManaged" : "overdueManaged")}
        </p>
      )}
      {status === "todo" && <WorkspaceQuickCreateTask goalId={quickCreateGoalId} boardHref={quickCreateBoardHref} />}
      {pagination && (
        <nav aria-label={t("lanePages", { lane: label })} className="mb-2 flex items-center justify-between gap-2">
          <p className="text-caption text-muted-foreground">{t("pageOf", { page: pagination.page, totalPages: pagination.totalPages })}</p>
          <div className="flex gap-1">
            {pagination.previousHref && (
              <Button asChild size="icon" variant="ghost">
                <Link href={pagination.previousHref} prefetch={false} scroll={false} aria-label={t("previousLanePage", { lane: label })}>
                  <ChevronLeft aria-hidden="true" />
                </Link>
              </Button>
            )}
            {pagination.nextHref && (
              <Button asChild size="icon" variant="ghost">
                <Link href={pagination.nextHref} prefetch={false} scroll={false} aria-label={t("nextLanePage", { lane: label })}>
                  <ChevronRight aria-hidden="true" />
                </Link>
              </Button>
            )}
          </div>
        </nav>
      )}
      <div className="space-y-2">
        {tasks.length ? (
          tasks.map((task) => (
            <WorkspaceTaskCard
              key={task.id}
              task={task}
              onOpen={onOpenTask}
              disabled={disabled || status === "in_review"}
              riskState={riskStateForTask(task)}
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
