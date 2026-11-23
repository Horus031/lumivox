"use client";

import { useConfirmDialog } from "@/components/ui/use-confirm-dialog";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { TaskEditForm } from "./task-edit-form";
import { MoreHorizontal, Pencil, Target, Trash2 } from "lucide-react";
import { getTaskBoardStatus } from "@/features/tasks/task-transition";

import { TaskStudyScheduleSection } from "@/features/learning-schedule/components/task-study-schedule-section";

import { TaskRiskSummary } from "@/features/native-task-risk/components/task-risk-summary";
import { TaskRiskPredictionButton } from "@/features/native-task-risk/components/task-risk-prediction-button";

import { startTaskRiskRecoveryAction } from "@/features/native-task-risk/task-risk-recovery.actions";
import { TaskRiskRecoveryHistory } from "@/features/native-task-risk/components/task-risk-recovery-history";
import { TaskRiskSuggestions } from "@/features/native-task-risk/components/task-risk-suggestions";

import { getTaskRiskDisplayState } from "@/features/native-task-risk/task-risk-display-state";
import { isTaskRiskEligible } from "@/features/native-task-risk/task-risk-snapshot.adapter";

import type { TaskRiskViewState } from "@/features/native-task-risk/task-risk-presentation.types";

import { useRouter as useLocalizedRouter } from "@/i18n/navigation";
import type { NativeTaskRiskRecommendedAction } from "@/features/native-task-risk/native-task-risk.types";

export type TaskDetailsTab =
  | "overview"
  | "risk"
  | "subtasks"
  | "documents"
  | "review";

type TaskDetailsModalProps = {
  task: TaskWithGoal | null;
  onClose: () => void;
  getReturnFocus?: (previous: HTMLElement | null, deleted: boolean) => HTMLElement | null;

  initialTab?: TaskDetailsTab;
  onTabChange?: (tab: TaskDetailsTab) => void;

  initialEditMode?: boolean;

  riskState?: TaskRiskViewState;
  riskNow?: Date;
  onTaskDataChanged?: () => void;
};

export function TaskDetailsModal({ task, ...props }: TaskDetailsModalProps) {
  return task ? <TaskDetailsSession key={task.id} task={task} {...props} /> : null;
}

function TaskDetailsSession({
  task,
  onClose,
  getReturnFocus,
  initialTab,
  onTabChange,
  initialEditMode,
  riskState,
  riskNow,
  onTaskDataChanged,
}: Omit<TaskDetailsModalProps, "task"> & { task: TaskWithGoal }) {
  const t = useTranslations("tasks.details");
  const confirm = useConfirmDialog();
  const locale = useLocale();
  const localizedRouter = useLocalizedRouter();

  const formT = useTranslations("tasks.form");

  const commonT = useTranslations("common");

  const router = useRouter();

  const [details, setDetails] = useState<TaskDetailsData | null>(null);

  const [defaultTab] = useState<TaskDetailsTab>(task.status === "in_review" ? "review" : "overview");
  const [selectedTab, setSelectedTab] = useState<TaskDetailsTab | null>(null);
  const [isScheduling, setIsScheduling] = useState(false);
  const activeTab = selectedTab ?? initialTab ?? defaultTab;

  function selectTab(tab: TaskDetailsTab) {
    if (tab === activeTab) return;
    setIsScheduling(false);
    setSelectedTab(tab);
  }

  useEffect(() => {
    // A server refresh can return older URL props while the user is viewing another tab.
    if (selectedTab && selectedTab !== initialTab) onTabChange?.(selectedTab);
  }, [initialTab, onTabChange, selectedTab]);

  const [isEditing, setIsEditing] = useState(initialEditMode ?? false);

  const [isLoadingDetails, startDetailsTransition] = useTransition();

  const [isDeleting, startDeleteTransition] = useTransition();

  const [recovery, setRecovery] = useState<{ taskId: string; id: string; action: string } | null>(null);
  const [predictedRisk, setPredictedRisk] = useState<{
    taskId: string; updatedAt: string; baseState: TaskRiskViewState | undefined;
    state: TaskRiskViewState;
  } | null>(null);
  const recoveryKeys = useRef(new Map<string, string>());
  const recoveryRequest = useRef(0);
  const taskId = task.id;

  const taskUpdatedAt = task.updated_at;
  const detailsRequest = useRef(0);
  const deleteRequest = useRef(0);
  const confirmingDelete = useRef(false);
  const deletedTask = useRef(false);
  const editPanelRef = useRef<HTMLDivElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const loadFailure = t("loadFailed");

  const refreshDetails = useCallback(() => {
    startDetailsTransition(async () => {
      const request = ++detailsRequest.current;
      const result = await getTaskDetailsAction(taskId).catch(() => null);
      if (request !== detailsRequest.current) return;

      if (!result?.success) {
        toast.error(result?.message ?? loadFailure);
        return;
      }

      if (result.data.task.id === taskId) setDetails(result.data);
    });
  }, [loadFailure, taskId]);

  useEffect(() => {
    setIsEditing(initialEditMode ?? false);
  }, [initialEditMode]);

  useEffect(() => {
    refreshDetails();
    return () => {
      detailsRequest.current += 1;
    };
  }, [taskUpdatedAt, refreshDetails]);

  useEffect(() => () => {
    deleteRequest.current += 1;
    recoveryRequest.current += 1;
  }, []);

  useEffect(() => {
    if (isEditing && activeTab === "overview") {
      editPanelRef.current?.querySelector("input")?.focus({ preventScroll: true });
    }
  }, [activeTab, isEditing, taskId]);

  const currentTask = details && Date.parse(details.task.updated_at) >= Date.parse(taskUpdatedAt)
    ? details.task : task;

  const localRisk = predictedRisk?.taskId === currentTask.id &&
    predictedRisk.updatedAt === currentTask.updated_at && predictedRisk.baseState === riskState
    ? predictedRisk : null;
  const riskCheckedAt = localRisk ? new Date() : riskNow;
  const currentRiskState: TaskRiskViewState = riskCheckedAt
    ? getTaskRiskDisplayState(currentTask, localRisk?.state ?? riskState, riskCheckedAt)
    : (riskState ?? { status: "unavailable" });

  async function handleRecoveryAction(
    type: NativeTaskRiskRecommendedAction["action_type"],
  ) {
    if (currentRiskState.status !== "ready") {
      return;
    }

    if (type === "view_task") {
      selectTab("overview");
      return;
    }
    const request = ++recoveryRequest.current;
    const predictionId = currentRiskState.alert.prediction_id;
    const key = `${currentTask.id}:${predictionId}:${type}`;
    const idempotencyKey = recoveryKeys.current.get(key) ?? crypto.randomUUID();
    recoveryKeys.current.set(key, idempotencyKey);
    let attemptId: string | null = null;
    try {
      attemptId = await startTaskRiskRecoveryAction({ taskId: currentTask.id, predictionId, actionType: type, idempotencyKey });
    } catch {
      // The original recovery workflow is still available during a tracking outage.
    }
    if (request !== recoveryRequest.current) return;
    setRecovery(attemptId ? { taskId: currentTask.id, id: attemptId, action: type } : null);

    switch (type) {
      case "start_focus":
        localizedRouter.push(
          `/focus?taskId=${encodeURIComponent(currentTask.id)}${attemptId ? `&recoveryAttemptId=${encodeURIComponent(attemptId)}` : ""}`,
        );
        return;

      case "split_task":
        setIsEditing(false);
        selectTab("subtasks");
        return;

      case "reschedule":
      case "reduce_scope":
        selectTab("overview");
        setIsEditing(true);
        return;

    }
  }

  const subtasks = details?.subtasks ?? [];

  const documents = details?.documents ?? [];

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const displayDate = (value: string | null) =>
    value ? dateFormatter.format(new Date(value)) : t("notSet");

  const status = getTaskBoardStatus(currentTask, riskNow ?? new Date());
  const metadata = [
    {
      label: t("summary.status"),
      value: <Badge variant="outline" className={getStatusTone(status)}>{formT(`statuses.${status}`)}</Badge>,
    },
    {
      label: t("summary.priority"),
      value: <Badge variant="outline" className={getPriorityTone(currentTask.priority)}>{formT(`priorities.${currentTask.priority}`)}</Badge>,
    },
    {
      label: t("summary.due"),
      value: currentTask.due_at
        ? <time dateTime={currentTask.due_at}>{displayDate(currentTask.due_at)}</time>
        : t("notSet"),
    },
    {
      label: t("summary.estimate"),
      value: currentTask.estimated_minutes === null
        ? t("notSet")
        : t("minutes", { minutes: currentTask.estimated_minutes }),
    },
  ];

  function finishEditing() {
    setRecovery(null);
    setIsEditing(false);
    requestAnimationFrame(() => editButtonRef.current?.focus({ preventScroll: true }));
  }

  async function handleDelete() {
    if (confirmingDelete.current || isDeleting) return;
    confirmingDelete.current = true;
    const request = deleteRequest.current;
    const confirmed = await confirm(t("deleteConfirm"), { variant: "destructive" }).finally(() => {
      confirmingDelete.current = false;
    });
    if (!confirmed || request !== deleteRequest.current) return;

    startDeleteTransition(async () => {
      const result = await deleteTaskAction(currentTask.id).catch(() => null);
      if (!result?.success) {
        toast.error(result?.message ?? t("deleteFailed"));
        return;
      }

      toast.success(result.message);
      onTaskDataChanged?.();
      if (request === deleteRequest.current) {
        deletedTask.current = true;
        onClose();
      }
      router.refresh();
    });
  }

  const tabClass = "h-auto min-h-touch flex-none px-2 sm:min-h-control sm:px-3";

  return (
    <TaskModalShell
      open
      size="wide"
      onClose={() => {
        if (!confirmingDelete.current) onClose();
      }}
      title={currentTask.title}
      description={t("fallbackDescription")}
      getReturnFocus={getReturnFocus ? (previous) => {
        const deleted = deletedTask.current;
        deletedTask.current = false;
        return getReturnFocus(previous, deleted);
      } : undefined}
      context={
        <div className="mb-1.5 flex min-w-0 items-center gap-2 text-caption font-medium text-muted-foreground">
          <Target aria-hidden="true" className="size-4 shrink-0" />
          <span className="sr-only">{t("summary.goal")}</span>
          <span title={currentTask.goals?.title} className="truncate">{currentTask.goals?.title ?? formT("noGoalAssigned")}</span>
        </div>
      }
      actions={
        <>
          {!isScheduling && (!isEditing || activeTab !== "overview") && (
            <Button
              ref={editButtonRef}
              type="button"
              variant="outline"
              size="sm"
              aria-label={commonT("edit")}
              title={commonT("edit")}
              className="size-touch sm:h-control sm:w-auto"
              onClick={() => {
                selectTab("overview");
                setIsEditing(true);
              }}
            >
              <Pencil aria-hidden="true" />
              <span className="hidden sm:inline">{commonT("edit")}</span>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={t("actions")} title={t("actions")}
                disabled={isDeleting} className="size-touch sm:size-control">
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => void handleDelete()}
              >
                <Trash2 aria-hidden="true" />
                {t("deleteTask")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    >
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,21rem)] lg:gap-7">
        <Tabs value={activeTab} onValueChange={(value) => selectTab(value as TaskDetailsTab)}>
          <TabsList
            variant="line"
            aria-label={t("sections")}
            className="w-full flex-wrap border-b border-border group-data-[orientation=horizontal]/tabs:h-auto sm:group-data-[orientation=horizontal]/tabs:h-auto"
          >
            <TabsTrigger value="overview" className={tabClass}>{t("tabs.overview")}</TabsTrigger>
            <TabsTrigger value="subtasks" className={tabClass}>{t("tabs.subtasks", { count: subtasks.length })}</TabsTrigger>
            <TabsTrigger value="documents" className={tabClass}>{t("tabs.documents", { count: documents.length })}</TabsTrigger>
            <TabsTrigger value="review" className={tabClass}>{t("tabs.review")}</TabsTrigger>
            <TabsTrigger value="risk" className={tabClass}>{t("tabs.risk")}</TabsTrigger>
          </TabsList>

          {isLoadingDetails && !details && (
            <p role="status" className="text-caption text-muted-foreground">{t("loadingDetails")}</p>
          )}
          <TabsContent value="overview" className="min-w-0 space-y-section">
            {isEditing ? (
              <div ref={editPanelRef} className="min-w-0">
                <TaskEditForm
                  key={currentTask.updated_at}
                  task={currentTask}
                  recoveryAttemptId={recovery?.taskId === currentTask.id && ["reschedule", "reduce_scope"].includes(recovery.action) ? recovery.id : undefined}
                  onCancel={finishEditing}
                  onSaved={() => {
                    finishEditing();
                    onTaskDataChanged?.();
                    refreshDetails();
                  }}
                />
              </div>
            ) : (
              <>
                <section className="space-y-2">
                  <h3 className="text-section font-semibold">{t("notes")}</h3>
                  <p className={currentTask.description?.trim()
                    ? "whitespace-pre-wrap text-body leading-relaxed wrap-anywhere"
                    : "text-body text-muted-foreground"}>
                    {currentTask.description?.trim() ? currentTask.description : t("noDescription")}
                  </p>
                </section>
                {activeTab === "overview" && (
                  <TaskStudyScheduleSection
                    taskId={currentTask.id}
                    eligible={currentTask.parent_task_id === null && ["todo", "in_progress"].includes(currentTask.status)}
                    onEditingChange={setIsScheduling}
                  />
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="risk" className="min-w-0 space-y-card">
            <TaskRiskSummary state={currentRiskState} />
            {(currentRiskState.status === "unavailable" || currentRiskState.status === "stale") &&
              isTaskRiskEligible(currentTask, new Date()) && (
              <TaskRiskPredictionButton
                key={`${currentTask.id}:${currentTask.updated_at}`}
                taskId={currentTask.id}
                stale={currentRiskState.status === "stale"}
                onPredicted={(state) => {
                  setPredictedRisk({ taskId: currentTask.id, updatedAt: currentTask.updated_at, baseState: riskState, state });
                  router.refresh();
                }}
              />
            )}

            <TaskRiskSuggestions
              state={currentRiskState}
              onActionRequested={handleRecoveryAction}
            />
            <TaskRiskRecoveryHistory key={currentTask.id} taskId={currentTask.id} revision={currentTask.updated_at} />
          </TabsContent>

          <TabsContent value="subtasks">
            <TaskSubtasksPanel
              parentTask={currentTask}
              recoveryAttemptId={recovery?.taskId === currentTask.id && recovery.action === "split_task" ? recovery.id : undefined}
              subtasks={subtasks}
              onChanged={() => {
                setRecovery(null);
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

        <aside aria-label={t("metadata")} className="min-w-0 space-y-4 lg:border-s lg:border-border lg:ps-6">
          <section className="rounded-xl border border-border bg-muted/30 p-4">
            <h3 className="text-section font-semibold">{t("metadata")}</h3>
            <dl className="mt-2 divide-y divide-border">
              {metadata.map(({ label, value }) => (
                <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-3 py-2">
                  <dt className="text-label text-muted-foreground">{label}</dt>
                  <dd className="text-end text-body font-medium wrap-anywhere">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <dl className="space-y-1.5 px-1 text-caption text-muted-foreground">
            <div className="flex flex-wrap justify-between gap-x-3">
              <dt>{t("created")}</dt>
              <dd><time dateTime={currentTask.created_at}>{displayDate(currentTask.created_at)}</time></dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-3">
              <dt>{t("updated")}</dt>
              <dd><time dateTime={currentTask.updated_at}>{displayDate(currentTask.updated_at)}</time></dd>
            </div>
          </dl>
        </aside>
      </div>
    </TaskModalShell>
  );
}
