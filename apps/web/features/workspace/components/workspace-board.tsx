"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Accessibility, PointerActivationConstraints, PointerSensor } from "@dnd-kit/dom";
import { DragDropProvider, type DragEndEvent, type DragStartEvent } from "@dnd-kit/react";
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

const BOARD_SENSORS = [
  PointerSensor.configure({
    activationConstraints: (event) => event.pointerType === "touch"
      ? [new PointerActivationConstraints.Delay({ value: 250, tolerance: 8 })]
      : [new PointerActivationConstraints.Distance({ value: 6 })],
  }),
];

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
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestInFlight = useRef(false);
  const draggedTaskId = useRef<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
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
  const activeTask = activeTaskId ? boardTasks.find((task) => task.id === activeTaskId) : undefined;
  const activeStatus = activeTask ? getTaskBoardStatus(activeTask, boardNow) : null;

  function handleDragStart(event: DragStartEvent) {
    const source = event.operation.source;
    if (!source) return;
    const taskId = String(source.id).slice(5);
    draggedTaskId.current = taskId;
    setActiveTaskId(taskId);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTaskId(null);
    if (event.canceled) return;
    const { source, target } = event.operation;
    if (!source) return;

    const board = boardRef.current;
    if (board && event.nativeEvent instanceof MouseEvent) {
      // Hit-test the release point so clipped lanes and stale collisions cannot receive a drop.
      const { clientX, clientY } = event.nativeEvent;
      const lane = board.ownerDocument.elementFromPoint(clientX, clientY)?.closest("[data-status]");
      const status = lane?.getAttribute("data-status");
      if (lane && status && board.contains(lane)) moveTask(String(source.id).slice(5), status);
      return;
    }

    const targetId = String(target?.id ?? "");
    if (!targetId.startsWith("lane:")) return;
    moveTask(String(source.id).slice(5), targetId.slice(5));
  }

  function moveTask(taskId: string, targetStatus: string) {
    if (requestInFlight.current || isPending) return;
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
    <DragDropProvider
      sensors={BOARD_SENSORS}
      plugins={(defaults) => defaults.filter((plugin) => plugin !== Accessibility)}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="min-w-0 overflow-hidden" aria-busy={isPending}>
        <div
          ref={boardRef}
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
                dropAllowed={activeStatus !== null && isDirectTaskStatusTarget(status) && canDirectlyTransitionTask(activeStatus, status)}
                onCardPointerDown={() => { draggedTaskId.current = null; }}
                onOpenTask={(task, event) => {
                  // Escape can end a drag before pointerup generates a click.
                  if (event.detail !== 0 && draggedTaskId.current === task.id) return;
                  openTask(task.id, event.currentTarget);
                }}
                onMoveTask={(taskId, targetStatus) => {
                  // Moving across lanes remounts the card and its menu trigger.
                  boardRef.current?.focus({ preventScroll: true });
                  moveTask(taskId, targetStatus);
                }}
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
