import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DragEndEvent } from "@dnd-kit/react";
import { workspaceTask } from "../workspace.test-fixtures";
import { TASK_RISK_UI_FIXTURES } from "@/features/native-task-risk/task-risk-ui.fixtures";

const confirmation = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("@/components/ui/use-confirm-dialog", () => ({
  useConfirmDialog: () => confirmation,
}));

const mocks = vi.hoisted(() => ({
  transition: vi.fn(),
  create: vi.fn(),
  refresh: vi.fn(),
  linkedTaskId: null as string | null,
  error: vi.fn(),
  dragEnd: undefined as ((event: DragEndEvent) => void) | undefined,
}));
vi.mock("@dnd-kit/dom", () => ({
  PointerSensor: { configure: (options: unknown) => options },
  PointerActivationConstraints: {},
}));
vi.mock("@dnd-kit/react", () => ({
  DragDropProvider: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode;
    onDragEnd: (event: DragEndEvent) => void;
  }) => {
    mocks.dragEnd = onDragEnd;
    return children;
  },
  useDraggable: () => ({
    ref: () => {},
    handleRef: () => {},
    isDragging: false,
  }),
  useDroppable: () => ({ ref: () => {}, isDropTarget: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
  useSearchParams: () => new URLSearchParams(mocks.linkedTaskId ? { task: mocks.linkedTaskId } : undefined),
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: mocks.refresh }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
vi.mock("@/features/tasks/task.actions", () => ({
  transitionTaskStatusAction: mocks.transition,
  createTaskAction: mocks.create,
}));
vi.mock("@/features/tasks/components/task-details-modal", () => ({
  TaskDetailsModal: ({
    task,
    initialTab,
    initialEditMode,
  }: {
    task: {
      title: string;
    } | null;

    initialTab?: string;

    initialEditMode?: boolean;
  }) =>
    task ? (
      <div
        data-drawer
        data-tab={initialTab}
        data-edit={String(Boolean(initialEditMode))}
      >
        {task.title}
      </div>
    ) : null,
}));

import { WorkspaceBoard as Board } from "./workspace-board";
import { WorkspaceTaskDetails } from "./workspace-task-details";

type TestBoardProps = ComponentProps<typeof Board> &
  Pick<ComponentProps<typeof WorkspaceTaskDetails>, "linkedTask" | "riskStates"> & {
    initialTaskTab?: ComponentProps<typeof WorkspaceTaskDetails>["tab"];
    initialEditMode: boolean;
  };

function WorkspaceBoard({ linkedTask, initialTaskTab, initialEditMode, riskStates, ...boardProps }: TestBoardProps) {
  mocks.linkedTaskId = linkedTask?.id ?? null;
  return (
    <WorkspaceTaskDetails
      linkedTask={linkedTask}
      boardTasks={boardProps.tasks}
      tab={initialTaskTab}
      edit={initialEditMode}
      closeHref="/workspace"
      referenceNow={boardProps.referenceNow}
      riskStates={riskStates}
    >
      <Board {...boardProps} />
    </WorkspaceTaskDetails>
  );
}

describe("workspace optimistic controller", () => {
  let container: HTMLDivElement;
  let root: Root;
  const task = workspaceTask();
  const props = {
    tasks: [task],
    goalId: null,
    referenceNow: "2026-10-04T12:00:00Z",
    riskStates: {},
  };
  beforeEach(() => {
    vi.clearAllMocks();
    confirmation.mockResolvedValue(true);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root.render(
        <WorkspaceBoard
          linkedTask={null}
          initialTaskTab={"overview"}
          initialEditMode={false}
          {...props}
        />,
      ),
    );
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  function move(status: string, canceled = false) {
    act(() =>
      mocks.dragEnd?.({
        canceled,
        operation: {
          source: { id: `task:${task.id}` },
          target: { id: `lane:${status}` },
        },
      } as DragEndEvent),
    );
  }
  function lane(status: string) {
    return container.querySelector(`[data-status="${status}"]`)!;
  }
  it("moves immediately, prevents concurrent drops, and rolls back on failure", async () => {
    let resolve!: (value: { success: false; message: string }) => void;
    mocks.transition.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    move("in_progress");
    expect(lane("in_progress").querySelector("article")).not.toBeNull();
    expect(lane("todo").querySelector("article")).toBeNull();
    move("completed");
    expect(mocks.transition).toHaveBeenCalledOnce();
    await act(async () => {
      resolve({ success: false, message: "staleTask" });
    });
    expect(lane("todo").querySelector("article")).not.toBeNull();
    expect(mocks.error).toHaveBeenCalledWith("staleTask");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("rolls back on a rejected request and refreshes", async () => {
    mocks.transition.mockRejectedValue(new Error("network"));
    move("in_progress");
    await act(async () => {});
    expect(lane("todo").querySelector("article")).not.toBeNull();
    expect(mocks.error).toHaveBeenCalledWith("transitionFailed");
  });
  it("ignores canceled/same-lane drags and rejects managed stages", () => {
    move("in_progress", true);
    move("todo");
    move("in_review");
    move("overdue");
    expect(mocks.transition).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledTimes(2);
  });
  it("adopts the server version after refresh", () => {
    act(() =>
      root.render(
        <WorkspaceBoard
          linkedTask={null}
          initialTaskTab={"overview"}
          initialEditMode={false}
          {...props}
          tasks={[{ ...task, status: "completed" }]}
        />,
      ),
    );
    expect(lane("completed").querySelector("article")).not.toBeNull();
  });
  it("opens details via a sibling button, without starting a drag", () => {
    const article = container.querySelector("article")!;
    expect(article.querySelector("button button")).toBeNull();
    act(() => (article.querySelector("button") as HTMLButtonElement).click());
    expect(container.querySelector("[data-drawer]")?.textContent).toBe(
      task.title,
    );
    expect(mocks.transition).not.toHaveBeenCalled();
  });

  it.each(["goal-1", null])("quick creates in Todo for goal %s", async (goalId) => {
    mocks.create.mockResolvedValue({ success: true, message: "Created", data: null });
    act(() => root.render(
      <WorkspaceBoard {...props} goalId={goalId} linkedTask={null} initialEditMode={false} />,
    ));
    const trigger = Array.from(lane("todo").querySelectorAll("button"))
      .find((button) => button.textContent === "addTask")!;
    act(() => trigger.click());
    const input = lane("todo").querySelector("input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Quick task");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      lane("todo").querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      title: "Quick task",
      goalId: goalId ?? "",
      priority: "medium",
      dueAt: "",
    }));
    expect(lane("todo").querySelector("form")).toBeNull();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("opens a linked task even when that task is outside the board cards", () => {
    const linkedTask = workspaceTask({ id: "subtask", parent_task_id: task.id, title: "Linked subtask" });
    act(() => root.render(
      <WorkspaceBoard key={linkedTask.id} {...props} linkedTask={linkedTask} initialTaskTab="subtasks" initialEditMode={false} />,
    ));
    const drawer = container.querySelector("[data-drawer]");
    expect(drawer?.textContent).toBe("Linked subtask");
    expect(drawer?.getAttribute("data-tab")).toBe("subtasks");
    expect(container.querySelectorAll("article")).toHaveLength(1);
  });

  it("invalidates visible risk during optimistic task transition", async () => {
    const high = TASK_RISK_UI_FIXTURES.find(
      (fixture) => fixture.id === "high",
    )?.state;

    if (!high || high.status !== "ready") {
      throw new Error("High-risk fixture is missing");
    }

    const riskTask = workspaceTask({
      due_at: "2026-10-05T12:00:00.000Z",
      updated_at: "2026-10-04T10:00:00.000Z",
    });

    const readyState = {
      status: "ready" as const,
      alert: {
        ...high.alert,
        task_id: riskTask.id,
        predicted_at: "2026-10-04T11:00:00.000Z",
        due_at: riskTask.due_at,
      },
    };

    act(() => {
      root.render(
        <WorkspaceBoard
          linkedTask={null}
          initialTaskTab="overview"
          initialEditMode={false}
          {...props}
          tasks={[riskTask]}
          riskStates={{
            [riskTask.id]: readyState,
          }}
        />,
      );
    });

    const indicator = container.querySelector<HTMLElement>(
      '[data-task-risk-indicator="high"]',
    );
    expect(indicator).not.toBeNull();

    // Risk indicator must belong to the Task open button.
    const openButton = indicator!.closest("button");
    expect(openButton).not.toBeNull();

    act(() => {
      indicator!.click();
    });

    // Clicking the risk indicator opens the Task Drawer.
    expect(container.querySelector("[data-drawer]")?.textContent).toBe(
      riskTask.title,
    );

    // Opening a Task must trigger zero status transitions.
    expect(mocks.transition).not.toHaveBeenCalled();

    let resolveTransition!: (result: {
      success: false;
      message: string;
    }) => void;

    mocks.transition.mockReturnValue(
      new Promise((resolve) => {
        resolveTransition = resolve;
      }),
    );

    act(() => {
      mocks.dragEnd?.({
        canceled: false,
        operation: {
          source: { id: `task:${riskTask.id}` },
          target: { id: "lane:in_progress" },
        },
      } as DragEndEvent);
    });

    expect(
      container.querySelector('[data-task-risk-indicator="high"]'),
    ).toBeNull();

    expect(
      container.querySelector('[data-task-risk-indicator="stale"]'),
    ).not.toBeNull();

    await act(async () => {
      resolveTransition({
        success: false,
        message: "staleTask",
      });
    });

    expect(mocks.refresh).toHaveBeenCalled();
  });
});
