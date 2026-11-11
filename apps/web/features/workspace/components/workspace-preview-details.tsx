"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConfirmDialog } from "@/components/ui/use-confirm-dialog";
import { deleteTaskAction, getTaskDetailsAction } from "@/features/tasks/task.actions";
import type { TaskDetailsData, TaskWithGoal } from "@/features/tasks/task.types";
import type { GoalOption } from "@/features/goals/goal.types";
import type { TaskDrawerTab } from "@/features/tasks/components/task-details-drawer";
import { TaskModalShell } from "@/features/tasks/components/task-modal-shell";
import { TaskEditForm } from "@/features/tasks/components/task-edit-form";
import { TaskSubtasksPanel } from "@/features/tasks/components/task-subtasks-panel";
import { getTaskBoardStatus } from "@/features/tasks/task-transition";
import { useRouter } from "@/i18n/navigation";

const Documents = dynamic(() => import("./workspace-task-documents").then((module) => module.WorkspaceTaskDocuments));
const Review = dynamic(() => import("@/features/task-review/components/task-review-panel").then((module) => module.TaskReviewPanel));
const Schedule = dynamic(() => import("@/features/learning-schedule/components/task-study-schedule-section").then((module) => module.TaskStudyScheduleSection));

type Section = "overview" | "documents" | "review";

export function WorkspacePreviewDetails({ task, goals, closeHref, tab, edit, referenceNow }: {
  task: TaskWithGoal;
  goals: GoalOption[];
  closeHref: string;
  tab?: TaskDrawerTab;
  edit: boolean;
  referenceNow: string;
}) {
  const t = useTranslations("workspace.phase3");
  const detailsT = useTranslations("tasks.details");
  const formT = useTranslations("tasks.form");
  const common = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();
  const confirm = useConfirmDialog();
  const [detail, setDetail] = useState<TaskDetailsData | null>(null);
  const [section, setSection] = useState<Section>(() => {
    if (edit) return "overview";
    if (tab === "documents" || tab === "review") return tab;
    return !tab && task.status === "in_review" ? "review" : "overview";
  });
  const [editing, setEditing] = useState(edit);
  const [schedule, setSchedule] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [deleting, startDelete] = useTransition();
  const checklist = useRef<HTMLElement>(null);
  const request = useRef(0);
  const current = detail?.task ?? task;
  const status = current.status === "overdue" ? "in_progress" : current.status;
  const overdue = getTaskBoardStatus(current, new Date(referenceNow)) === "overdue";
  const taskId = task.id;
  const taskVersion = task.updated_at;

  const refresh = useCallback(() => {
    const version = ++request.current;
    startTransition(async () => {
      const result = await getTaskDetailsAction(taskId, false);
      if (request.current !== version) return;
      if (result.success) {
        setDetail(result.data);
        setFailed(false);
      } else {
        setFailed(true);
        toast.error(result.message);
      }
    });
  }, [taskId]);

  useEffect(() => {
    refresh();
    return () => { request.current += 1; };
  }, [refresh, taskVersion]);

  useEffect(() => {
    if (tab === "subtasks" && detail) checklist.current?.scrollIntoView({ block: "nearest" });
  }, [tab, detail]);

  function close() {
    router.replace(closeHref, { scroll: false });
  }

  async function remove() {
    if (!await confirm(detailsT("deleteConfirm"), { variant: "destructive" })) return;
    startDelete(async () => {
      const result = await deleteTaskAction(current.id);
      if (result.success) {
        toast.success(result.message);
        close();
        router.refresh();
      } else toast.error(result.message);
    });
  }

  const reviewVisible = section === "review" || tab === "review" || current.parent_task_id === null && current.status !== "todo";
  const scheduleEligible = current.parent_task_id === null && ["todo", "in_progress"].includes(current.status);
  const sections: Section[] = reviewVisible ? ["overview", "documents", "review"] : ["overview", "documents"];

  return (
    <TaskModalShell open onClose={close} title={current.title} description={t("taskDetail")} align="workspace">
      <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
        <aside className="min-w-0 space-y-2 border-b pb-3 md:order-2 md:border-b-0 md:border-l md:pb-0 md:pl-4">
          <h3 className="text-xs font-semibold text-muted-foreground">{t("properties")}</h3>
          <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary">{formT(`statuses.${status}`)}</Badge>
          <Badge variant="outline">{formT(`priorities.${current.priority}`)}</Badge>
          {current.due_at && <span className="text-muted-foreground">{format.dateTime(new Date(current.due_at), { dateStyle: "medium", timeStyle: "short" })}</span>}
          {overdue && <Badge variant="outline" className="text-destructive">{formT("statuses.overdue")}</Badge>}
        </div>
          {current.goals && <p className="break-words text-sm text-muted-foreground">{current.goals.title}</p>}
        </aside>
        <div className="min-w-0 space-y-4 md:order-1">
        <nav aria-label={t("taskSections")} className="flex flex-wrap gap-1 border-b pb-2">
          {sections.map((item) => <Button key={item} type="button" size="sm"
            variant={item === section ? "secondary" : "ghost"} aria-pressed={item === section}
            onClick={() => setSection(item)}>{t(item)}</Button>)}
        </nav>

        {section === "documents" && <Documents key={current.id} taskId={current.id} goalId={current.goal_id} />}
        {section === "review" && detail && <Review task={current} subtasks={detail.subtasks} onTaskChanged={refresh} />}
        {section === "overview" && <>
          {editing ? <TaskEditForm key={current.updated_at} task={current} goals={goals} searchableGoals
            onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} /> : <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{detailsT("notes")}</h3>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>{common("edit")}</Button>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm">{current.description?.trim() || detailsT("noDescription")}</p>
            <section ref={checklist} aria-label={t("checklist")} className="space-y-2 border-t pt-4">
              <h3 className="font-semibold">{t("checklist")}</h3>
              {detail && <TaskSubtasksPanel parentTask={current} subtasks={detail.subtasks} goals={goals} onChanged={refresh} />}
            </section>
            {scheduleEligible && <details onToggle={(event) => setSchedule(event.currentTarget.open)}>
              <summary className="cursor-pointer text-sm font-medium">{t("schedule")}</summary>
              {schedule && <Schedule taskId={current.id} eligible />}
            </details>}
            <details>
              <summary className="cursor-pointer text-sm font-medium">{t("moreActions")}</summary>
              <Button type="button" size="sm" variant="destructive" className="mt-2" onClick={remove} disabled={deleting}>
                {deleting ? detailsT("deleting") : detailsT("deleteTask")}
              </Button>
            </details>
          </>}
        </>}
        {!detail && section !== "documents" && (
          failed ? <Button variant="outline" type="button" onClick={refresh}>{t("retry")}</Button> :
            <p role="status" aria-busy={pending} className="text-sm text-muted-foreground">{t("loading")}</p>
        )}
        </div>
      </div>
    </TaskModalShell>
  );
}
