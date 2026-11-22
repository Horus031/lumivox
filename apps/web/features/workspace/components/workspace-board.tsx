"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { TASK_BOARD_LANES } from "@/features/tasks/task-status";
import { transitionTaskStatusAction } from "@/features/tasks/task.actions";
import {
  canDirectlyTransitionTask,
  getTaskBoardStatus,
  getTaskCompletedAt,
  isDirectTaskStatusTarget,
} from "@/features/tasks/task-transition";

import type { WorkspaceBoardPages, WorkspaceBoardPagination, WorkspaceTask } from "../workspace.types";
import { groupWorkspaceTasksByStatus, workspaceBoardHref } from "../workspace.utils";
import { WorkspaceLane } from "./workspace-lane";

import { useWorkspaceTaskDetails } from "./workspace-task-details";

type WorkspaceBoardProps = {
  tasks: WorkspaceTask[];
  goalId: string | null;

  referenceNow: string;
  pagination?: WorkspaceBoardPagination;
};

export function WorkspaceBoard({
  tasks,
  goalId,
  referenceNow,
  pagination,
}: WorkspaceBoardProps) {
  const taskT = useTranslations("tasks.form");
  const t = useTranslations("workspace.board");
  const router = useRouter();
  const { openTask, riskForTask, invalidateRisk } = useWorkspaceTaskDetails();
  const [boardTasks, setBoardTasks] = useState(tasks);
  const [serverTasks, setServerTasks] = useState(tasks);
  const [isPending, startTransition] = useTransition();
  const requestInFlight = useRef(false);
  const boardNow = useMemo(() => new Date(referenceNow), [referenceNow]);

  if (serverTasks !== tasks) {
    setServerTasks(tasks);
    setBoardTasks(tasks);
  }

  const groupedTasks = useMemo(
    () => groupWorkspaceTasksByStatus(boardTasks, boardNow),
    [boardTasks, boardNow],
  );
  const serverGroups = useMemo(
    () => pagination ? groupWorkspaceTasksByStatus(tasks, boardNow) : null,
    [tasks, boardNow, pagination],
  );
  const lanePages: WorkspaceBoardPages = {};
  if (pagination) {
    for (const status of TASK_BOARD_LANES) lanePages[status] = pagination[status].page;
  }
  const currentBoardHref = pagination ? workspaceBoardHref(goalId ?? "unassigned", lanePages) : undefined;

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
    invalidateRisk();
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
    <DragDropProvider onDragEnd={handleDragEnd}>
      <div className="min-w-0 overflow-hidden" aria-busy={isPending}>
        <div
          role="region"
          aria-label={t("title")}
          tabIndex={0}
          className="flex items-start gap-card overflow-x-auto px-0.5 pt-0.5 pb-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {TASK_BOARD_LANES.map((status) => {
            const lane = pagination?.[status];
            const pageHref = (page: number) => workspaceBoardHref(goalId ?? "unassigned", { ...lanePages, [status]: page });
            const shown = groupedTasks[status];
            const total = lane && serverGroups ? lane.total + shown.length - serverGroups[status].length : shown.length;
            return (
              <WorkspaceLane
                key={status}
                status={status}
                label={taskT(`statuses.${status}`)}
                tasks={shown}
                total={total}
                pagination={lane && lane.totalPages > 1 ? {
                  page: lane.page,
                  totalPages: lane.totalPages,
                  previousHref: lane.page > 1 ? pageHref(lane.page - 1) : undefined,
                  nextHref: lane.page < lane.totalPages ? pageHref(lane.page + 1) : undefined,
                } : undefined}
                onOpenTask={(task, trigger) => openTask(task.id, trigger)}
                disabled={isPending}
                quickCreateGoalId={goalId}
                quickCreateBoardHref={currentBoardHref}
                riskStateForTask={riskForTask}
              />
            );
          })}
        </div>
      </div>
    </DragDropProvider>
  );
}
