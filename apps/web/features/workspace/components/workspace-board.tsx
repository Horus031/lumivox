"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { TaskDetailsDrawer } from "@/features/tasks/components/task-details-drawer";
import { TASK_BOARD_LANES } from "@/features/tasks/task-status";
import { transitionTaskStatusAction } from "@/features/tasks/task.actions";
import {
  canDirectlyTransitionTask,
  getTaskBoardStatus,
  getTaskCompletedAt,
  isDirectTaskStatusTarget,
} from "@/features/tasks/task-transition";

import type { WorkspaceScope, WorkspaceTask } from "../workspace.types";
import { groupWorkspaceTasksByStatus } from "../workspace.utils";
import { WorkspaceLane } from "./workspace-lane";

type WorkspaceBoardProps = {
  tasks: WorkspaceTask[];
  scope: WorkspaceScope;
  referenceNow: string;
};

export function WorkspaceBoard({
  tasks,
  scope,
  referenceNow,
}: WorkspaceBoardProps) {
  const taskT = useTranslations("tasks.form");
  const t = useTranslations("workspace.board");
  const router = useRouter();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [boardTasks, setBoardTasks] = useState(tasks);
  const [serverTasks, setServerTasks] = useState(tasks);
  const [isPending, startTransition] = useTransition();
  const requestInFlight = useRef(false);
  const boardNow = useMemo(() => new Date(referenceNow), [referenceNow]);
  const quickCreateGoalId = scope.type === "goal" ? scope.goalId : null;

  // Reset the local snapshot when refreshed server props arrive, before paint.
  if (serverTasks !== tasks) {
    setServerTasks(tasks);
    setBoardTasks(tasks);
  }
  const selectedTask =
    boardTasks.find((task) => task.id === selectedTaskId) ?? null;

  const groupedTasks = useMemo(
    () => groupWorkspaceTasksByStatus(boardTasks, boardNow),
    [boardTasks, boardNow],
  );

  function handleDragEnd(event: DragEndEvent) {
    if (event.canceled || requestInFlight.current || isPending) return;
    const { source, target } = event.operation;
    if (!source || !target) return;
    const taskId = String(source.id).replace(/^task:/, "");
    const targetId = String(target.id);
    if (!targetId.startsWith("lane:")) return;
    const targetStatus = targetId.slice(5);
    const task = boardTasks.find((item) => item.id === taskId);
    if (!task) return;
    const currentStatus = getTaskBoardStatus(task, boardNow);
    if (currentStatus === targetStatus) return;
    if (
      !isDirectTaskStatusTarget(targetStatus) ||
      !canDirectlyTransitionTask(currentStatus, targetStatus)
    ) {
      toast.error(t("invalidTransition"));
      return;
    }

    const previousTasks = boardTasks;
    requestInFlight.current = true;
    setBoardTasks((current) =>
      current.map((item) =>
        item.id === taskId
          ? {
              ...item,
              status: targetStatus,
              completed_at: getTaskCompletedAt(item, targetStatus, new Date()),
            }
          : item,
      ),
    );
    startTransition(async () => {
      try {
        const result = await transitionTaskStatusAction({
          taskId,
          targetStatus,
          expectedStatus: task.status,
          expectedUpdatedAt: task.updated_at,
        });
        if (!result.success) {
          setBoardTasks(previousTasks);
          toast.error(result.message);
        } else {
          setBoardTasks((current) =>
            current.map((item) =>
              item.id === taskId
                ? {
                    ...item,
                    status: result.data.status,
                    completed_at: result.data.completedAt,
                    updated_at: result.data.updatedAt,
                  }
                : item,
            ),
          );
        }
      } catch {
        setBoardTasks(previousTasks);
        toast.error(t("transitionFailed"));
      } finally {
        router.refresh();
        requestInFlight.current = false;
      }
    });
  }

  return (
    <>
      <DragDropProvider onDragEnd={handleDragEnd}>
        <div className="min-w-0 overflow-hidden" aria-busy={isPending}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {TASK_BOARD_LANES.map((status) => (
              <WorkspaceLane
                key={status}
                status={status}
                label={taskT(`statuses.${status}`)}
                tasks={groupedTasks[status]}
                onOpenTask={(task) => setSelectedTaskId(task.id)}
                disabled={isPending}
                quickCreateGoalId={quickCreateGoalId}
              />
            ))}
          </div>
        </div>
      </DragDropProvider>

      <TaskDetailsDrawer
        task={selectedTask}
        onClose={() => setSelectedTaskId(null)}
      />
    </>
  );
}
