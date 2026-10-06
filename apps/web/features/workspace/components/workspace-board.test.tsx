import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DragEndEvent } from "@dnd-kit/react";
import { workspaceTask } from "../workspace.test-fixtures";

const mocks = vi.hoisted(() => ({
  transition: vi.fn(),
  create: vi.fn(),
  refresh: vi.fn(),
  error: vi.fn(),
  dragEnd: undefined as ((event: DragEndEvent) => void) | undefined,
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
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
vi.mock("@/features/tasks/task.actions", () => ({
  transitionTaskStatusAction: mocks.transition,
  createTaskAction: mocks.create,
}));
vi.mock("@/features/tasks/components/task-details-drawer", () => ({
  TaskDetailsDrawer: ({
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

import { WorkspaceBoard } from "./workspace-board";

describe("workspace optimistic controller", () => {
  let container: HTMLDivElement;
  let root: Root;
  const task = workspaceTask();
  const props = {
    tasks: [task],
    scope: { type: "all" as const },
    referenceNow: "2026-10-04T12:00:00Z",
  };
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<WorkspaceBoard {...props} />));
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

  it.each([
    { scope: { type: "all" as const }, goalId: "" },
    { scope: { type: "unassigned" as const }, goalId: "" },
    { scope: { type: "goal" as const, goalId: task.id }, goalId: task.id },
  ])(
    "quick create uses the correct goal for $scope.type",
    async ({ scope, goalId }) => {
      mocks.create.mockResolvedValue({
        success: true,
        message: "created",
        data: null,
      });
      act(() => root.render(<WorkspaceBoard {...props} scope={scope} />));
      act(() =>
        (lane("todo").querySelector("button") as HTMLButtonElement).click(),
      );
      const input = lane("todo").querySelector("input")!;
      act(() => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )!.set!.call(input, "Quick task");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => {
        lane("todo")
          .querySelector("form")!
          .dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          );
      });
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Quick task",
          goalId,
          priority: "medium",
          dueAt: "",
        }),
      );
      expect(mocks.refresh).toHaveBeenCalledOnce();
    },
  );
});
