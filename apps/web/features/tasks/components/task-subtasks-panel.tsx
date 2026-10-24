"use client";

import { useConfirmDialog } from "@/components/ui/use-confirm-dialog";

import { useState, useTransition, type FormEvent } from "react";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Check, Play, RotateCcw, X } from "lucide-react";

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
  const confirm = useConfirmDialog();

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

  async function handleDelete(subtask: TaskWithGoal) {
    const confirmed = await confirm(t("deleteConfirm"), { variant: "destructive" });

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
    <div className="min-w-0 space-y-card">
      <div>
        <h3 className="text-base text-section font-semibold text-foreground">
          {t("title")}
        </h3>

        <p className="mt-1 text-body text-secondary-text">
          {t("description")}
        </p>
      </div>

      {canCreate ? (
        <form onSubmit={handleCreate} aria-busy={isPending} className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            maxLength={160}
            disabled={isPending}
          />

          <Button type="submit" disabled={isPending || !title.trim()}>
            <Plus aria-hidden="true" />{isPending ? t("adding") : t("add")}
          </Button>
        </form>
      ) : (
        <div className="border-y border-border py-card text-body text-muted-foreground">
          {t("createUnavailable")}
        </div>
      )}

      {subtasks.length === 0 ? (
        <div className="border-y border-border py-section text-center">
          <p className="text-body text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
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
                className="min-w-0 border-t border-border py-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body font-medium text-foreground [overflow-wrap:anywhere]">
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
                    size="icon"
                    variant="ghost"
                    aria-label={t("delete")} title={t("delete")}
                    disabled={isPending}
                    onClick={() => handleDelete(subtask)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
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
                      {action.target === "completed" ? <Check aria-hidden="true" /> : action.target === "in_progress" ? <Play aria-hidden="true" /> : action.target === "cancelled" ? <X aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}{action.label}
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
                    <Pencil aria-hidden="true" />{commonT("edit")}
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
