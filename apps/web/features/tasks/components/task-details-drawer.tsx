"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  deleteTaskAction,
  getTaskDetailsAction,
} from "@/features/tasks/task.actions";

import type {
  TaskDetailsData,
  TaskWithGoal,
} from "@/features/tasks/task.types";

import { formatDisplayDate } from "@/lib/utils/date";

import { getPriorityTone, getStatusTone } from "@/lib/utils/color";

import { TaskDocumentsPanel } from "./task-documents-panel";

import { TaskModalShell } from "./task-modal-shell";

import { TaskSubtasksPanel } from "./task-subtasks-panel";

import { TaskReviewPanel } from "@/features/task-review/components/task-review-panel";
import { GoalOption } from "@/features/goals/goal.types";
import { TaskEditForm } from "./task-edit-form";

export type TaskDrawerTab = "overview" | "subtasks" | "documents" | "review";

type TaskDetailsDrawerProps = {
  task: TaskWithGoal | null;

  goals: GoalOption[];

  onClose: () => void;

  initialTab?: TaskDrawerTab;

  initialEditMode?: boolean;
};

export function TaskDetailsDrawer({
  task,
  goals,
  onClose,
  initialTab,
  initialEditMode,
}: TaskDetailsDrawerProps) {
  const t = useTranslations("tasks.details");

  const formT = useTranslations("tasks.form");

  const commonT = useTranslations("common");

  const router = useRouter();

  const [details, setDetails] = useState<TaskDetailsData | null>(null);

  const [activeTab, setActiveTab] = useState<TaskDrawerTab>(
    initialTab ?? "overview",
  );

  const [isEditing, setIsEditing] = useState(initialEditMode ?? false);

  const [isLoadingDetails, startDetailsTransition] = useTransition();

  const [isDeleting, startDeleteTransition] = useTransition();

  const taskId = task?.id ?? null;

  const taskUpdatedAt = task?.updated_at ?? null;

  const refreshDetails = useCallback(() => {
    if (!taskId) {
      return;
    }

    startDetailsTransition(async () => {
      const result = await getTaskDetailsAction(taskId);

      if (!result.success) {
        toast.error(result.message);

        return;
      }

      setDetails(result.data);
    });
  }, [taskId]);

  useEffect(() => {
    if (!taskId) {
      setDetails(null);

      return;
    }

    setDetails(null);

    setActiveTab(
      initialTab ?? (task?.status === "in_review" ? "review" : "overview"),
    );

    setIsEditing(initialEditMode ?? false);

    refreshDetails();
  }, [taskId, taskUpdatedAt, initialTab, initialEditMode, refreshDetails]);

  if (!task) {
    return null;
  }

  const currentTask = details?.task ?? task;

  const subtasks = details?.subtasks ?? [];

  const documents = details?.documents ?? [];

  const summaryRows = [
    {
      label: t("summary.goal"),

      value: currentTask.goals?.title ?? formT("noGoalAssigned"),
    },
    {
      label: t("summary.due"),

      value: formatDisplayDate(currentTask.due_at),
    },
    {
      label: t("summary.estimate"),

      value: currentTask.estimated_minutes
        ? t("minutes", {
            minutes: currentTask.estimated_minutes,
          })
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
    const confirmed = window.confirm(t("deleteConfirm"));

    if (!confirmed) {
      return;
    }

    startDeleteTransition(async () => {
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
        <div className="flex flex-wrap items-center justify-between gap-3">
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
            disabled={isDeleting}
            className="rounded-full px-5"
          >
            {isDeleting ? t("deleting") : t("deleteTask")}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Badge
            variant="secondary"
            className={`rounded-full px-3 py-1.5 ${getPriorityTone(
              currentTask.priority,
            )}`}
          >
            {formT(`priorities.${currentTask.priority}`)}
          </Badge>

          <Badge
            variant="outline"
            className={`rounded-full px-3 py-1.5 ${getStatusTone(
              currentTask.status,
            )}`}
          >
            {formT(`statuses.${currentTask.status}`)}
          </Badge>
        </div>

        {isLoadingDetails && !details ? (
          <div className="rounded-2xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
            {t("loadingDetails")}
          </div>
        ) : null}

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TaskDrawerTab)}
          className="w-full"
        >
          <div className="overflow-x-auto pb-1">
            <TabsList>
              <TabsTrigger value="overview">{t("tabs.overview")}</TabsTrigger>

              <TabsTrigger value="subtasks">
                {t("tabs.subtasks", {
                  count: subtasks.length,
                })}
              </TabsTrigger>

              <TabsTrigger value="documents">
                {t("tabs.documents", {
                  count: documents.length,
                })}
              </TabsTrigger>

              <TabsTrigger value="review">{t("tabs.review")}</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview">
            <div className="flex items-center justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsEditing((current) => !current)}
              >
                {isEditing ? commonT("cancel") : commonT("edit")}
              </Button>
            </div>

            {isEditing ? (
              <div className="rounded-3xl border border-border/70 bg-muted/20 p-4">
                <TaskEditForm
                  key={currentTask.updated_at}
                  task={currentTask}
                  goals={goals}
                  onCancel={() => setIsEditing(false)}
                  onSaved={() => {
                    setIsEditing(false);

                    refreshDetails();
                  }}
                />
              </div>
            ) : null}

            <div className="space-y-5">
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
          </TabsContent>

          <TabsContent value="subtasks">
            <TaskSubtasksPanel
              parentTask={currentTask}
              subtasks={subtasks}
              goals={goals}
              onChanged={refreshDetails}
            />
          </TabsContent>

          <TabsContent value="documents">
            <TaskDocumentsPanel
              taskId={currentTask.id}
              documents={documents}
              onChanged={refreshDetails}
            />
          </TabsContent>

          <TabsContent value="review">
            <TaskReviewPanel
              task={currentTask}
              subtasks={subtasks}
              onTaskChanged={refreshDetails}
            />
          </TabsContent>
        </Tabs>
      </div>
    </TaskModalShell>
  );
}
