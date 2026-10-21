"use client";

import { useState, useTransition, type FormEvent } from "react";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  createSubtaskAction,
  deleteTaskAction,
  transitionTaskStatusAction,
} from "@/features/tasks/task.actions";

import {
  canDirectlyTransitionTask,
  getTaskBoardStatus,
  type DirectTaskStatus,
} from "@/features/tasks/task-transition";

import type { TaskWithGoal } from "@/features/tasks/task.types";

import { getPriorityTone, getStatusTone } from "@/lib/utils/color";

import type { GoalOption } from "@/features/goals/goal.types";

import { TaskEditForm } from "./task-edit-form";

type TaskSubtasksPanelProps = {
  parentTask: TaskWithGoal;

  subtasks: TaskWithGoal[];

  goals: GoalOption[];

  onChanged: () => void;
};

export function TaskSubtasksPanel({
  parentTask,
  subtasks,
  goals,
  onChanged,
}: TaskSubtasksPanelProps) {
  const t = useTranslations("tasks.details.subtasks");

  const formT = useTranslations("tasks.form");

  const commonT = useTranslations("common");

  const router = useRouter();

  const [title, setTitle] = useState("");

  const [isPending, startTransition] = useTransition();

  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);

  const canCreate =
    parentTask.parent_task_id === null &&
    parentTask.status !== "completed" &&
    parentTask.status !== "cancelled" &&
    parentTask.status !== "in_review";

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedTitle = title.trim();

    if (!normalizedTitle || isPending) {
      return;
    }

    startTransition(async () => {
      const result = await createSubtaskAction({
        parentTaskId: parentTask.id,

        title: normalizedTitle,
      });

      if (!result.success) {
        toast.error(result.message);

        return;
      }

      toast.success(result.message);

      setTitle("");

      onChanged();

      router.refresh();
    });
  }

  function transitionSubtask(
    subtask: TaskWithGoal,

    targetStatus: DirectTaskStatus,
  ) {
    startTransition(async () => {
      const result = await transitionTaskStatusAction({
        taskId: subtask.id,

        targetStatus,

        expectedStatus: subtask.status,

        expectedUpdatedAt: subtask.updated_at,
      });

      if (!result.success) {
        toast.error(result.message);

        onChanged();

        router.refresh();

        return;
      }

      toast.success(result.message);

      onChanged();

      router.refresh();
    });
  }

  function handleDelete(subtask: TaskWithGoal) {
    const confirmed = window.confirm(t("deleteConfirm"));

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const result = await deleteTaskAction(subtask.id);

      if (!result.success) {
        toast.error(result.message);

        return;
      }

      toast.success(result.message);

      onChanged();

      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          {t("title")}
        </h3>

        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {t("description")}
        </p>
      </div>

      {canCreate ? (
        <form onSubmit={handleCreate} className="flex gap-2">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("placeholder")}
            maxLength={160}
            disabled={isPending}
          />

          <Button type="submit" disabled={isPending || !title.trim()}>
            {isPending ? t("adding") : t("add")}
          </Button>
        </form>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
          {t("createUnavailable")}
        </div>
      )}

      {subtasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 p-7 text-center">
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {subtasks.map((subtask) => {
            const boardStatus = getTaskBoardStatus(subtask, new Date());

            const actions: Array<{
              target: DirectTaskStatus;
              label: string;
            }> = [];

            if (canDirectlyTransitionTask(boardStatus, "in_progress")) {
              actions.push({
                target: "in_progress",

                label: boardStatus === "completed" ? t("reopen") : t("start"),
              });
            }

            if (canDirectlyTransitionTask(boardStatus, "todo")) {
              actions.push({
                target: "todo",

                label:
                  boardStatus === "cancelled" ? t("restore") : t("moveToTodo"),
              });
            }

            if (canDirectlyTransitionTask(boardStatus, "completed")) {
              actions.push({
                target: "completed",

                label: t("complete"),
              });
            }

            if (canDirectlyTransitionTask(boardStatus, "cancelled")) {
              actions.push({
                target: "cancelled",

                label: t("cancel"),
              });
            }

            return (
              <article
                key={subtask.id}
                className="rounded-[22px] border border-border/60 bg-muted/25 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {subtask.title}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge
                        variant="secondary"
                        className={getPriorityTone(subtask.priority)}
                      >
                        {formT(`priorities.${subtask.priority}`)}
                      </Badge>

                      <Badge
                        variant="outline"
                        className={getStatusTone(boardStatus)}
                      >
                        {formT(`statuses.${boardStatus}`)}
                      </Badge>
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => handleDelete(subtask)}
                  >
                    {t("delete")}
                  </Button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {actions.map((action) => (
                    <Button
                      key={action.target}
                      type="button"
                      size="sm"
                      variant={
                        action.target === "completed" ? "default" : "outline"
                      }
                      disabled={isPending}
                      onClick={() => transitionSubtask(subtask, action.target)}
                    >
                      {action.label}
                    </Button>
                  ))}

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() =>
                      setEditingSubtaskId((current) =>
                        current === subtask.id ? null : subtask.id,
                      )
                    }
                  >
                    {commonT("edit")}
                  </Button>
                </div>

                {editingSubtaskId === subtask.id ? (
                  <div className="mt-4 border-t border-border/60 pt-4">
                    <TaskEditForm
                      key={subtask.updated_at}
                      task={subtask}
                      goals={goals}
                      allowGoalChange={false}
                      onCancel={() => setEditingSubtaskId(null)}
                      onSaved={() => {
                        setEditingSubtaskId(null);

                        onChanged();
                      }}
                    />
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
