"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TaskWithGoal } from "@/features/tasks/task.types";
import { deleteTaskAction } from "@/features/tasks/task.actions";
import { formatDisplayDate } from "@/lib/utils/date";

import { TaskModalShell } from "./task-modal-shell";

type TaskDetailsDrawerProps = {
  task: TaskWithGoal | null;
  onClose: () => void;
};

function getStatusLabel(status: TaskWithGoal["status"]) {
  return status.replace("_", " ");
}

export function TaskDetailsDrawer({ task, onClose }: TaskDetailsDrawerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (!task) {
    return null;
  }

  const currentTask = task;

  const summaryRows = [
    { label: "Goal", value: currentTask.goals?.title ?? "No goal assigned" },
    { label: "Due", value: formatDisplayDate(currentTask.due_at) },
    {
      label: "Estimate",
      value: currentTask.estimated_minutes
        ? `${currentTask.estimated_minutes} minutes`
        : "Not set",
    },
    { label: "Priority", value: currentTask.priority },
    { label: "Status", value: getStatusLabel(currentTask.status) },
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
      description={currentTask.description ?? "Task details"}
      align="right"
      footer={
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="rounded-full px-5"
          >
            Close
          </Button>

          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
            className="rounded-full px-5"
          >
            {isPending ? "Deleting..." : "Delete task"}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Badge
            variant="secondary"
            className="rounded-full px-3 py-1.5 capitalize"
          >
            {currentTask.priority}
          </Badge>
          <Badge
            variant="outline"
            className="rounded-full px-3 py-1.5 capitalize"
          >
            {getStatusLabel(currentTask.status)}
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
              <p className="mt-2 text-sm font-medium text-foreground">{row.value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-3xl bg-muted/35 p-4 ring-1 ring-border/50">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Notes
          </p>
          <p className="mt-2 text-sm leading-6 text-foreground/90">
            {currentTask.description?.trim()
              ? currentTask.description
              : "No description has been added for this task yet."}
          </p>
        </div>

        <div className="rounded-3xl bg-muted/35 p-4 ring-1 ring-border/50">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            System fields
          </p>
          <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
            <div className="flex items-center justify-between gap-3">
              <span>Created</span>
              <span className="font-medium text-foreground">
                {formatDisplayDate(currentTask.created_at)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Updated</span>
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