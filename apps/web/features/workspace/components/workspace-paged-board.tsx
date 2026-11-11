"use client";

import { useRef, useState, useTransition } from "react";
import { DragDropProvider, useDroppable, type DragEndEvent } from "@dnd-kit/react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { transitionTaskStatusAction } from "@/features/tasks/task.actions";
import { TASK_BOARD_LANES, type TaskStatus } from "@/features/tasks/task-status";
import { canDirectlyTransitionTask, getTaskBoardStatus, isDirectTaskStatusTarget } from "@/features/tasks/task-transition";
import { WorkspaceSummaryCard } from "./workspace-task-card";
import { WorkspaceQuickCreateTask } from "./workspace-quick-create-task";
import { loadWorkspaceLane } from "../workspace-board-pages.action";
import { isInitiallyOpenLane, type BoardLanePage, type BoardLanePages, type WorkspaceFilters } from "../workspace-board-pages";

export type WorkspacePagedBoardProps = {
  initial: BoardLanePages;
  filters: WorkspaceFilters;
  referenceNow: string;
  goalId: string | null;
  href: string;
};

export function WorkspacePagedBoard({ initial, filters, referenceNow, goalId, href }: WorkspacePagedBoardProps) {
  const t = useTranslations("workspace.phase3");
  const board = useTranslations("workspace.board");
  const router = useRouter();
  const [lanes, setLanes] = useState(initial);
  const [open, setOpen] = useState(() => TASK_BOARD_LANES.filter((lane) => isInitiallyOpenLane(lane, filters.status)));
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const fingerprint = JSON.stringify(initial);
  const [seed, setSeed] = useState(fingerprint);
  const [boardNow, setBoardNow] = useState(referenceNow);

  if (seed !== fingerprint) {
    setSeed(fingerprint);
    setLanes(initial);
    setBoardNow(referenceNow);
    setOpen(TASK_BOARD_LANES.filter((lane) => isInitiallyOpenLane(lane, filters.status)));
  }

  function run(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      try {
        await action();
      } catch {
        toast.error(t("boardFailed"));
        router.refresh();
      } finally {
        busy.current = false;
      }
    });
  }

  function changeLane(lane: TaskStatus) {
    if (busy.current) return;
    if (open.includes(lane)) {
      setOpen((current) => current.filter((item) => item !== lane));
      return;
    }
    run(async () => {
      const page = await loadWorkspaceLane({ filters, referenceNow: boardNow, lane });
      setLanes((current) => ({ ...current, [lane]: page }));
      setOpen((current) => [...current, lane]);
    });
  }

  function loadMore(lane: TaskStatus) {
    const last = lanes[lane].tasks.at(-1);
    if (!last) return;
    run(async () => {
      const page = await loadWorkspaceLane({ filters, referenceNow: boardNow, lane, after: { id: last.id, createdAt: last.created_at } });
      setLanes((current) => {
        const ids = new Set(current[lane].tasks.map((task) => task.id));
        return {
          ...current,
          [lane]: { ...page, tasks: [...current[lane].tasks, ...page.tasks.filter((task) => !ids.has(task.id))] },
        };
      });
    });
  }

  function move(event: DragEndEvent) {
    if (event.canceled || !event.operation.source || !event.operation.target) return;
    const taskId = String(event.operation.source.id).replace(/^task:/, "");
    const target = String(event.operation.target.id).replace(/^lane:/, "");
    const source = TASK_BOARD_LANES.find((lane) => lanes[lane].tasks.some((task) => task.id === taskId));
    if (!source || source === target) return;
    const task = lanes[source].tasks.find((item) => item.id === taskId);
    if (!task || !isDirectTaskStatusTarget(target) || !canDirectlyTransitionTask(source, target)) {
      toast.error(board("invalidTransition"));
      return;
    }

    run(async () => {
      const result = await transitionTaskStatusAction({
        taskId, targetStatus: target, expectedStatus: task.status, expectedUpdatedAt: task.updated_at,
      });
      if (!result.success) {
        toast.error(result.message);
        const page = await loadWorkspaceLane({ filters, referenceNow: boardNow, lane: source });
        setLanes((current) => ({ ...current, [source]: page }));
        router.refresh();
        return;
      }
      const destination = getTaskBoardStatus({ ...task, status: result.data.status }, new Date(boardNow));
      const affected = [...new Set([source, destination])];
      const updates = await Promise.all(affected.map(async (lane) => [
        lane, await loadWorkspaceLane({ filters, referenceNow: boardNow, lane, countsOnly: !open.includes(lane) }),
      ] as const));
      setLanes((current) => ({ ...current, ...Object.fromEntries(updates) }));
      toast.success(result.message);
      if (goalId && (source === "completed" || destination === "completed")) router.refresh();
    });
  }

  return (
    <DragDropProvider onDragEnd={move}>
      <div role="region" aria-label={board("title")} aria-busy={pending} tabIndex={0}
        className="flex min-w-0 items-start gap-3 overflow-x-auto p-1 pb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {TASK_BOARD_LANES.map((status) => (
          <PagedLane key={status} status={status} page={lanes[status]} open={open.includes(status)} pending={pending}
            goalId={goalId} toggle={() => changeLane(status)} more={() => loadMore(status)}
            onOpen={(id) => router.push(`${href}&task=${id}`, { scroll: false })}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}

function PagedLane({ status, page, open, pending, goalId, toggle, more, onOpen }: {
  status: TaskStatus;
  page: BoardLanePage;
  open: boolean;
  pending: boolean;
  goalId: string | null;
  toggle: () => void;
  more: () => void;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("workspace.phase3");
  const board = useTranslations("workspace.board");
  const taskT = useTranslations("tasks.form");
  const label = taskT(`statuses.${status}`);
  const droppable = useDroppable({
    id: `lane:${status}`, type: "workspace-lane", accept: "workspace-task",
    disabled: pending || !isDirectTaskStatusTarget(status),
    data: { status },
  });

  return (
    <section ref={droppable.ref} data-status={status} className={cn(
      "w-64 shrink-0 space-y-2 rounded-lg bg-muted/50 p-2",
      open ? "min-h-36" : "min-h-12",
      droppable.isDropTarget && "ring-2 ring-ring",
    )}>
      <h2>
        <button type="button" className="flex min-h-9 w-full items-center gap-2 text-left text-sm font-semibold"
          aria-expanded={open} onClick={toggle} disabled={pending}>
          {open ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}
          <span>{label}</span><span className="ml-auto tabular-nums text-muted-foreground" data-testid="workspace-lane-total">{page.total}</span>
        </button>
      </h2>
      {open && <>
        {(status === "in_review" || status === "overdue") && <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <LockKeyhole className="size-4 shrink-0" aria-hidden="true" />
          {board(status === "in_review" ? "reviewManaged" : "overdueManaged")}
        </p>}
        {status === "todo" && <WorkspaceQuickCreateTask goalId={goalId} withOptions compact />}
        {page.tasks.map((task) => <WorkspaceSummaryCard key={task.id} task={task} goalTitle={task.goal_title}
          subtaskCount={task.subtask_count} completedSubtasks={task.completed_subtask_count}
          disabled={pending || status === "in_review"} onOpen={() => onOpen(task.id)} />)}
        {!page.tasks.length && <p className="text-sm text-muted-foreground">{board("empty")}</p>}
        {page.hasMore && <Button type="button" size="sm" variant="outline" onClick={more} disabled={pending}>{t("loadMore", { lane: label })}</Button>}
      </>}
    </section>
  );
}
