"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { TaskDetailsDrawer, type TaskDrawerTab } from "@/features/tasks/components/task-details-drawer";
import type { TaskWithGoal } from "@/features/tasks/task.types";
import { getTaskRiskDisplayState } from "@/features/native-task-risk/task-risk-display-state";
import type { TaskRiskViewState } from "@/features/native-task-risk/task-risk-presentation.types";
import type { WorkspaceTaskRiskMap } from "@/features/native-task-risk/task-risk-workspace.queries";
import { useRouter } from "@/i18n/navigation";

type DetailsContext = {
  openTask: (id: string) => void;
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
  tab?: TaskDrawerTab;
  edit: boolean;
  closeHref: string;
  referenceNow: string;
  riskStates: WorkspaceTaskRiskMap;
  children: ReactNode;
}) {
  const router = useRouter();
  const linkedRequest = JSON.stringify([linkedTask?.id, tab, edit]);
  const [previousLinkedRequest, setPreviousLinkedRequest] = useState(linkedRequest);
  const [selectedId, setSelectedId] = useState(linkedTask?.id ?? null);
  const [serverRiskStates, setServerRiskStates] = useState(riskStates);
  const [riskInvalidated, setRiskInvalidated] = useState(false);
  const [clockMs, setClockMs] = useState(() => Date.parse(referenceNow));

  useEffect(() => {
    const timer = window.setInterval(() => setClockMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (previousLinkedRequest !== linkedRequest) {
    setPreviousLinkedRequest(linkedRequest);
    setSelectedId(linkedTask?.id ?? null);
  }

  if (serverRiskStates !== riskStates) {
    setServerRiskStates(riskStates);
    setRiskInvalidated(false);
  }

  const riskNow = new Date(Math.max(clockMs, Date.parse(referenceNow)));
  const isLinked = selectedId !== null && selectedId === linkedTask?.id;
  const selectedTask = boardTasks?.find((task) => task.id === selectedId) ?? (isLinked ? linkedTask : null);

  function riskForTask(task: Parameters<typeof getTaskRiskDisplayState>[0]) {
    return getTaskRiskDisplayState(task, riskStates[task.id], riskNow, riskInvalidated);
  }

  function invalidateRisk() {
    setRiskInvalidated(true);
  }

  return (
    <WorkspaceTaskDetailsContext.Provider value={{ openTask: setSelectedId, riskForTask, invalidateRisk }}>
      {children}
      <TaskDetailsDrawer
        task={selectedTask}
        initialTab={isLinked ? tab : undefined}
        initialEditMode={isLinked && edit}
        onClose={() => {
          setSelectedId(null);
          if (isLinked) router.replace(closeHref, { scroll: false });
        }}
        riskState={selectedTask ? riskForTask(selectedTask) : undefined}
        riskNow={riskNow}
        onTaskDataChanged={invalidateRisk}
      />
    </WorkspaceTaskDetailsContext.Provider>
  );
}
