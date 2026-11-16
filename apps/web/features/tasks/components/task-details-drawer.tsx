"use client";

import { useConfirmDialog } from "@/components/ui/use-confirm-dialog";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
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

import { getPriorityTone, getStatusTone } from "@/lib/utils/color";

import { TaskDocumentsPanel } from "./task-documents-panel";

import { TaskModalShell } from "./task-modal-shell";

import { TaskSubtasksPanel } from "./task-subtasks-panel";

import { TaskReviewPanel } from "@/features/task-review/components/task-review-panel";
import { GoalOption } from "@/features/goals/goal.types";
import { TaskEditForm } from "./task-edit-form";
import { Pencil, Trash2, X } from "lucide-react";

import { TaskStudyScheduleSection } from "@/features/learning-schedule/components/task-study-schedule-section";

import { TaskRiskSummary } from "@/features/native-task-risk/components/task-risk-summary";

import { TaskRiskSuggestions } from "@/features/native-task-risk/components/task-risk-suggestions";

import { getTaskRiskDisplayState } from "@/features/native-task-risk/task-risk-display-state";

import type { TaskRiskViewState } from "@/features/native-task-risk/task-risk-presentation.types";

import { useRouter as useLocalizedRouter } from "@/i18n/navigation";
import type { NativeTaskRiskRecommendedAction } from "@/features/native-task-risk/native-task-risk.types";

export type TaskDrawerTab =
  | "overview"
  | "risk"
  | "subtasks"
  | "documents"
  | "review";

type TaskDetailsDrawerProps = {
  task: TaskWithGoal | null;

  goals: GoalOption[];

  onClose: () => void;

  initialTab?: TaskDrawerTab;

  initialEditMode?: boolean;

  riskState?: TaskRiskViewState;
  riskNow?: Date;
  onTaskDataChanged?: () => void;
};

export function TaskDetailsDrawer({
  task,
  goals,
  onClose,
  initialTab,
  initialEditMode,
  riskState,
  riskNow,
  onTaskDataChanged,
}: TaskDetailsDrawerProps) {
  const t = useTranslations("tasks.details");
  const confirm = useConfirmDialog();
  const locale = useLocale();
  const localizedRouter = useLocalizedRouter();

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
  const detailsRequest = useRef(0);

  const refreshDetails = useCallback(() => {
    if (!taskId) {
      return;
    }

    startDetailsTransition(async () => {
      const request = ++detailsRequest.current;
      const result = await getTaskDetailsAction(taskId);
      if (request !== detailsRequest.current) return;

      if (!result.success) {
        toast.error(result.message);

        return;
      }

      if (result.data.task.id === taskId) setDetails(result.data);
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
    return () => {
      detailsRequest.current += 1;
    };
  }, [
    taskId,
    taskUpdatedAt,
    task?.status,
    initialTab,
    initialEditMode,
    refreshDetails,
  ]);

  if (!task) {
    return null;
  }

  const currentDetails = details?.task.id === task.id ? details : null;
  const currentTask = currentDetails?.task ?? task;

  const currentRiskState: TaskRiskViewState = riskNow
    ? getTaskRiskDisplayState(currentTask, riskState, riskNow)
    : (riskState ?? { status: "unavailable" });

  function handleRecoveryAction(
    type: NativeTaskRiskRecommendedAction["action_type"],
  ) {
    if (currentRiskState.status !== "ready") {
      return;
    }

    switch (type) {
      case "start_focus":
        localizedRouter.push(
          `/focus?taskId=${encodeURIComponent(currentTask.id)}`,
        );
        return;

      case "split_task":
        setIsEditing(false);
        setActiveTab("subtasks");
        return;

      case "reschedule":
      case "reduce_scope":
        setActiveTab("overview");
        setIsEditing(true);
        return;

      case "view_task":
        setActiveTab("overview");
        return;
    }
  }

  const subtasks = currentDetails?.subtasks ?? [];

  const documents = currentDetails?.documents ?? [];

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const displayDate = (value: string | null) =>
    value ? dateFormatter.format(new Date(value)) : t("notSet");

  const summaryRows = [
    {
      label: t("summary.goal"),

      value: currentTask.goals?.title ?? formT("noGoalAssigned"),
    },
    {
      label: t("summary.due"),

      value: displayDate(currentTask.due_at),
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

  async function handleDelete() {
    const confirmed = await confirm(t("deleteConfirm"), {
      variant: "destructive",
    });

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

      onTaskDataChanged?.();
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
          <Button type="button" variant="outline" onClick={onClose}>
            {t("close")}
          </Button>

          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 aria-hidden="true" />
            {isDeleting ? t("deleting") : t("deleteTask")}
          </Button>
        </div>
      }
    >
      <div className="min-w-0 space-y-card">
        <div className="flex flex-wrap gap-2">
          <Badge
            variant="secondary"
            className={`${getPriorityTone(currentTask.priority)}`}
          >
            {formT(`priorities.${currentTask.priority}`)}
          </Badge>

          <Badge
            variant="outline"
            className={`${getStatusTone(currentTask.status)}`}
          >
            {formT(`statuses.${currentTask.status}`)}
          </Badge>
        </div>

        {isLoadingDetails && !details ? (
          <div role="status" className="py-2 text-body text-muted-foreground">
            {t("loadingDetails")}
          </div>
        ) : null}

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TaskDrawerTab)}
          className="w-full"
        >
          <div className="overflow-x-auto pb-1">
            <TabsList
              variant="line"
              className="min-w-max border-b border-border"
            >
              <TabsTrigger value="overview">{t("tabs.overview")}</TabsTrigger>

              <TabsTrigger value="risk">{t("tabs.risk")}</TabsTrigger>

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

          <TabsContent value="overview" className="min-w-0 space-y-card">
            <div className="flex items-center justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsEditing((current) => !current)}
              >
                {isEditing ? (
                  <X aria-hidden="true" />
                ) : (
                  <Pencil aria-hidden="true" />
                )}
                {isEditing ? commonT("cancel") : commonT("edit")}
              </Button>
            </div>

            {isEditing ? (
              <div className="min-w-0">
                <TaskEditForm
                  key={currentTask.updated_at}
                  task={currentTask}
                  goals={goals}
                  onCancel={() => setIsEditing(false)}
                  onSaved={() => {
                    setIsEditing(false);
                    onTaskDataChanged?.();
                    refreshDetails();
                  }}
                />
              </div>
            ) : null}

            {!isEditing ? (
              <div className="space-y-card">
                <dl className="grid gap-card sm:grid-cols-2">
                  {summaryRows.map((row) => (
                    <div key={row.label} className="min-w-0">
                      <dt className="text-label font-medium text-muted-foreground">
                        {row.label}
                      </dt>

                      <dd className="mt-1 text-body font-medium text-foreground wrap-anywhere">
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="border-t border-border pt-card">
                  <h3 className="text-label font-medium text-muted-foreground">
                    {t("notes")}
                  </h3>

                  <p className="mt-1 whitespace-pre-wrap text-body text-foreground wrap-anywhere">
                    {currentTask.description?.trim()
                      ? currentTask.description
                      : t("noDescription")}
                  </p>
                </div>

                <div className="border-t border-border pt-card">
                  <h3 className="text-label font-medium text-muted-foreground">
                    {t("systemFields")}
                  </h3>

                  <div className="mt-2 grid gap-2 text-body text-muted-foreground">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>{t("created")}</span>

                      <span className="font-medium text-foreground">
                        {displayDate(currentTask.created_at)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>{t("updated")}</span>

                      <span className="font-medium text-foreground">
                        {displayDate(currentTask.updated_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {!isEditing && (
              <TaskStudyScheduleSection
                key={currentTask.id}
                taskId={currentTask.id}
                eligible={
                  currentTask.parent_task_id === null &&
                  ["todo", "in_progress"].includes(currentTask.status)
                }
              />
            )}
          </TabsContent>

          <TabsContent value="risk" className="min-w-0 space-y-card">
            <TaskRiskSummary state={currentRiskState} />

            <TaskRiskSuggestions
              state={currentRiskState}
              onActionRequested={handleRecoveryAction}
            />
          </TabsContent>

          <TabsContent value="subtasks">
            <TaskSubtasksPanel
              parentTask={currentTask}
              subtasks={subtasks}
              goals={goals}
              onChanged={() => {
                onTaskDataChanged?.();
                refreshDetails();
              }}
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
              onTaskChanged={() => {
                onTaskDataChanged?.();
                refreshDetails();
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </TaskModalShell>
  );
}
