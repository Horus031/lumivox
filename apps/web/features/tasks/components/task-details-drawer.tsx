"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TaskWithGoal } from "@/features/tasks/task.types";
import { deleteTaskAction } from "@/features/tasks/task.actions";
import { formatDisplayDate } from "@/lib/utils/date";
import { getPriorityTone, getStatusTone } from "@/lib/utils/color";
import { TaskModalShell } from "./task-modal-shell";

type TaskDetailsDrawerProps = {
  task: TaskWithGoal | null;
  onClose: () => void;
};

export function TaskDetailsDrawer({ task, onClose }: TaskDetailsDrawerProps) {
  const t = useTranslations("tasks.details");
  const formT = useTranslations("tasks.form");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (!task) {
    return null;
  }

  const currentTask = task;

  const summaryRows = [
    {
      label: t("summary.goal"),
      value: currentTask.goals?.title ?? formT("noGoalAssigned"),
    },
    { label: t("summary.due"), value: formatDisplayDate(currentTask.due_at) },
    {
      label: t("summary.estimate"),
      value: currentTask.estimated_minutes
        ? t("minutes", { minutes: currentTask.estimated_minutes })
        : t("notSet"),
    },
    {
      label: t("summary.priority"),
      value: formT(`priorities.${currentTask.priority}`),
    },
    {
      label: t("summary.status"),
      value: formT(`statuses.${currentTask.status}`),
    },
  ];

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteTaskAction(currentTask.id);

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      onClose();
      router.refresh();
    });
  }

  return (
    <TaskModalShell
      open={Boolean(task)}
      onClose={onClose}
      title={currentTask.title}
      description={currentTask.description ?? t("fallbackDescription")}
      align="right"
      footer={
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="rounded-full px-5"
          >
            {t("close")}
          </Button>

          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
            className="rounded-full px-5"
          >
            {isPending ? t("deleting") : t("deleteTask")}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Badge
            variant="secondary"
            className={`rounded-full px-3 py-1.5 capitalize ${getPriorityTone(
              currentTask.priority,
            )}`}
          >
            {formT(`priorities.${currentTask.priority}`)}
          </Badge>
          <Badge
            variant="outline"
            className={`rounded-full px-3 py-1.5 capitalize ${getStatusTone(
              currentTask.status,
            )}`}
          >
            {formT(`statuses.${currentTask.status}`)}
          </Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {summaryRows.map((row) => (
            <div
              key={row.label}
              className="rounded-[22px] bg-muted/45 px-4 py-3 ring-1 ring-border/50"
            >
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                {row.label}
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {row.value}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-3xl bg-muted/35 p-4 ring-1 ring-border/50">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            {t("notes")}
          </p>
          <p className="mt-2 text-sm leading-6 text-foreground/90">
            {currentTask.description?.trim()
              ? currentTask.description
              : t("noDescription")}
          </p>
        </div>

        <div className="rounded-3xl bg-muted/35 p-4 ring-1 ring-border/50">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            {t("systemFields")}
          </p>
          <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
            <div className="flex items-center justify-between gap-3">
              <span>{t("created")}</span>
              <span className="font-medium text-foreground">
                {formatDisplayDate(currentTask.created_at)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>{t("updated")}</span>
              <span className="font-medium text-foreground">
                {formatDisplayDate(currentTask.updated_at)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </TaskModalShell>
  );
}
