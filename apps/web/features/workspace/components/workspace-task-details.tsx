"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { TaskDetailsModal, type TaskDetailsTab } from "@/features/tasks/components/task-details-modal";
import type { TaskWithGoal } from "@/features/tasks/task.types";
import { getTaskRiskDisplayState } from "@/features/native-task-risk/task-risk-display-state";
import type { TaskRiskViewState } from "@/features/native-task-risk/task-risk-presentation.types";
import type { WorkspaceTaskRiskMap } from "@/features/native-task-risk/task-risk-workspace.queries";
import { useSearchParams } from "next/navigation";

type DetailsContext = {
  openTask: (id: string, trigger: HTMLElement) => void;
  onTaskLinkClick: (id: string, trigger: HTMLElement) => void;
  riskForTask: (task: Parameters<typeof getTaskRiskDisplayState>[0]) => TaskRiskViewState;
  invalidateRisk: () => void;
};

const WorkspaceTaskDetailsContext = createContext<DetailsContext | null>(null);

export function useWorkspaceTaskDetails() {
  const details = useContext(WorkspaceTaskDetailsContext);
  if (!details) throw new Error("Workspace task views require WorkspaceTaskDetails.");
  return details;
}

export function WorkspaceTaskDetails({
  linkedTask,
  boardTasks,
  tab,
  edit,
  closeHref,
  referenceNow,
  riskStates,
  children,
}: {
  linkedTask: TaskWithGoal | null;
  boardTasks?: readonly TaskWithGoal[];
  tab?: TaskDetailsTab;
  edit: boolean;
  closeHref: string;
  referenceNow: string;
  riskStates: WorkspaceTaskRiskMap;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const t = useTranslations("workspace.page");
  const viewRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<{ id: string; element: HTMLElement } | null>(null);
  const linkedId = linkedTask && searchParams.get("task")?.toLowerCase() === linkedTask.id ? linkedTask.id : null;
  const linkedRequest = JSON.stringify([linkedId, tab, edit]);
  const [previousLinkedRequest, setPreviousLinkedRequest] = useState(linkedRequest);
  const [selectedId, setSelectedId] = useState(linkedId);
  const [serverRiskStates, setServerRiskStates] = useState(riskStates);
  const [riskInvalidated, setRiskInvalidated] = useState(false);
  const [clockMs, setClockMs] = useState(() => Date.parse(referenceNow));

  useEffect(() => {
    const timer = window.setInterval(() => setClockMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (previousLinkedRequest !== linkedRequest) {
    setPreviousLinkedRequest(linkedRequest);
    setSelectedId(linkedId);
  }

  if (serverRiskStates !== riskStates) {
    setServerRiskStates(riskStates);
    setRiskInvalidated(false);
  }

  const riskNow = new Date(Math.max(clockMs, Date.parse(referenceNow)));
  const isLinked = selectedId !== null && selectedId === linkedId;
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
  }

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
        initialTab={isLinked ? tab : undefined}
        initialEditMode={isLinked && edit}
        getReturnFocus={getReturnFocus}
        onClose={() => {
          setSelectedId(null);
          if (isLinked) {
            const { pathname, hash, origin } = window.location;
            const { search } = new URL(closeHref, origin);
            // Closing the dialog only changes task parameters. Keep the current view mounted.
            window.history.replaceState(null, "", `${pathname}${search}${hash}`);
          }
        }}
        riskState={selectedTask ? riskForTask(selectedTask) : undefined}
        riskNow={riskNow}
        onTaskDataChanged={invalidateRisk}
      />
    </WorkspaceTaskDetailsContext.Provider>
  );
}
