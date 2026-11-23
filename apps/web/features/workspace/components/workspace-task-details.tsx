"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { TaskDetailsModal, type TaskDetailsTab } from "@/features/tasks/components/task-details-modal";
import type { TaskWithGoal } from "@/features/tasks/task.types";
import { getTaskRiskDisplayState } from "@/features/native-task-risk/task-risk-display-state";
import type { TaskRiskViewState } from "@/features/native-task-risk/task-risk-presentation.types";
import type { WorkspaceTaskRiskMap } from "@/features/native-task-risk/task-risk-workspace.queries";
import { useRouter, useSearchParams } from "next/navigation";

type DetailsContext = {
  openTask: (id: string, trigger: HTMLElement) => void;
  onTaskLinkClick: (id: string, trigger: HTMLElement) => void;
  riskForTask: (task: Parameters<typeof getTaskRiskDisplayState>[0]) => TaskRiskViewState;
  invalidateRisk: () => void;
};

const WorkspaceTaskDetailsContext = createContext<DetailsContext | null>(null);
const TASK_DETAILS_TABS = ["overview", "risk", "subtasks", "documents", "review"] as const;

export function useWorkspaceTaskDetails() {
  const details = useContext(WorkspaceTaskDetailsContext);
  if (!details) throw new Error("Workspace task views require WorkspaceTaskDetails.");
  return details;
}

export function WorkspaceTaskDetails({
  linkedTask,
  boardTasks,
  closeHref,
  referenceNow,
  riskStates,
  children,
}: {
  linkedTask: TaskWithGoal | null;
  boardTasks?: readonly TaskWithGoal[];
  closeHref: string;
  referenceNow: string;
  riskStates: WorkspaceTaskRiskMap;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations("workspace.page");
  const viewRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<{ id: string; element: HTMLElement } | null>(null);
  const urlTaskId = searchParams.get("task")?.toLowerCase() ?? null;
  const urlTab = searchParams.get("tab");
  const [previousUrlTaskId, setPreviousUrlTaskId] = useState(urlTaskId);
  const [selectedId, setSelectedId] = useState(urlTaskId);
  const [serverRiskStates, setServerRiskStates] = useState(riskStates);
  const [riskInvalidated, setRiskInvalidated] = useState(false);
  const [clockMs, setClockMs] = useState(() => Date.parse(referenceNow));

  useEffect(() => {
    const timer = window.setInterval(() => setClockMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (previousUrlTaskId !== urlTaskId) {
    setPreviousUrlTaskId(urlTaskId);
    setSelectedId(urlTaskId);
  }

  if (serverRiskStates !== riskStates) {
    setServerRiskStates(riskStates);
    setRiskInvalidated(false);
  }

  const riskNow = new Date(Math.max(clockMs, Date.parse(referenceNow)));
  const isLinked = selectedId !== null && selectedId === urlTaskId;
  const selectedTask = boardTasks?.find((task) => task.id === selectedId) ?? (selectedId === linkedTask?.id ? linkedTask : null);

  function riskForTask(task: Parameters<typeof getTaskRiskDisplayState>[0]) {
    return getTaskRiskDisplayState(task, riskStates[task.id], riskNow, riskInvalidated);
  }

  function invalidateRisk() {
    setRiskInvalidated(true);
  }

  function rememberTaskTrigger(id: string, trigger: HTMLElement) {
    triggerRef.current = { id, element: trigger };
  }

  function onTaskLinkClick(id: string, trigger: HTMLElement) {
    rememberTaskTrigger(id, trigger);
    if (linkedTask?.id === id) setSelectedId(id);
  }

  function openTask(id: string, trigger: HTMLElement) {
    rememberTaskTrigger(id, trigger);
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("task", id);
    url.searchParams.delete("tab");
    url.searchParams.delete("edit");
    window.history.replaceState(null, "", url);
  }

  const selectTaskTab = useCallback((tab: TaskDetailsTab) => {
    if (!selectedId) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("task") === selectedId && url.searchParams.get("tab") === tab) return;
    url.searchParams.set("task", selectedId);
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url);
  }, [selectedId]);

  function getReturnFocus(previous: HTMLElement | null, deleted: boolean) {
    const view = viewRef.current;
    const trigger = triggerRef.current;
    triggerRef.current = null;

    if (!deleted && trigger?.id === selectedId && view?.contains(trigger.element)) return trigger.element;
    if (!deleted && !isLinked && view?.contains(previous)) return previous;
    return view;
  }

  return (
    <WorkspaceTaskDetailsContext.Provider value={{ openTask, onTaskLinkClick, riskForTask, invalidateRisk }}>
      <div ref={viewRef} role="group" aria-label={t("taskView")} tabIndex={-1}
        className="min-w-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {children}
      </div>
      <TaskDetailsModal
        task={selectedTask}
        initialTab={isLinked ? TASK_DETAILS_TABS.find((tab) => tab === urlTab) : undefined}
        initialEditMode={isLinked && searchParams.get("edit") === "1"}
        onTabChange={selectTaskTab}
        getReturnFocus={getReturnFocus}
        onClose={() => {
          setSelectedId(null);
          if (selectedId !== null && new URLSearchParams(window.location.search).get("task")?.toLowerCase() === selectedId) {
            const { pathname, hash, origin } = window.location;
            const { search } = new URL(closeHref, origin);
            // Supersede any queued refresh for the task route before returning to the current view.
            router.replace(`${pathname}${search}${hash}`, { scroll: false });
          }
        }}
        riskState={selectedTask ? riskForTask(selectedTask) : undefined}
        riskNow={riskNow}
        onTaskDataChanged={invalidateRisk}
      />
    </WorkspaceTaskDetailsContext.Provider>
  );
}
