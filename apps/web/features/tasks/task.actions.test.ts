import { beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceTask } from "../workspace/workspace.test-fixtures";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), schedule: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock(
  "@/features/engagement-retention/engagement-retention.background",
  () => ({ scheduleEngagementRecalculation: mocks.schedule }),
);
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));

import { transitionTaskStatusAction, updateTaskAction } from "./task.actions";

describe("task workflow actions", () => {
  const task = workspaceTask();
  let query: Record<string, ReturnType<typeof vi.fn>>;
  const input = {
    taskId: task.id,
    targetStatus: "completed" as const,
    expectedStatus: task.status,
    expectedUpdatedAt: task.updated_at,
  };
  beforeEach(() => {
    vi.clearAllMocks();
    query = {};
    for (const key of ["from", "select", "eq", "update"])
      query[key] = vi.fn(() => query);
    query.maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: task, error: null })
      .mockResolvedValueOnce({
        data: {
          id: task.id,
          status: "completed",
          completed_at: "2026-10-04T12:00:00Z",
          updated_at: "new-version",
        },
        error: null,
      });
    query.single = query.maybeSingle;
    mocks.requireUser.mockResolvedValue({
      user: { id: task.user_id },
      supabase: query,
    });
  });
  it("checks ownership and uses both concurrency predicates on the update", async () => {
    expect((await transitionTaskStatusAction(input)).success).toBe(true);
    expect(query.eq).toHaveBeenCalledWith("user_id", task.user_id);
    expect(query.eq).toHaveBeenCalledWith("status", task.status);
    expect(query.eq).toHaveBeenCalledWith("updated_at", task.updated_at);
    expect(query.update).toHaveBeenCalledWith({
      status: "completed",
      completed_at: expect.any(String),
    });
    expect(mocks.schedule).toHaveBeenCalledWith({
      userId: task.user_id,
      source: "task-transition",
      activity: { type: "task", id: task.id },
    });
  });
  it("rejects a stale version before mutation", async () => {
    const result = await transitionTaskStatusAction({
      ...input,
      expectedUpdatedAt: "stale",
    });
    expect(result).toMatchObject({ success: false, message: "staleTask" });
    expect(query.update).not.toHaveBeenCalled();
  });
  it("handles an atomic race after the fetch without engagement side effects", async () => {
    query.maybeSingle
      .mockReset()
      .mockResolvedValueOnce({ data: task, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    expect(await transitionTaskStatusAction(input)).toMatchObject({
      success: false,
      message: "staleTask",
    });
    expect(mocks.schedule).not.toHaveBeenCalled();
  });
  it("cannot move overdue into progress even when DB status is todo", async () => {
    query.maybeSingle
      .mockReset()
      .mockResolvedValue({
        data: { ...task, due_at: "2000-01-01T00:00:00Z" },
        error: null,
      });
    expect(
      await transitionTaskStatusAction({
        ...input,
        targetStatus: "in_progress",
      }),
    ).toMatchObject({ success: false, message: "invalidTransition" });
    expect(query.update).not.toHaveBeenCalled();
  });
  it("reopening clears completion and schedules full reconciliation", async () => {
    query.maybeSingle
      .mockReset()
      .mockResolvedValueOnce({
        data: { ...task, status: "completed" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: task.id,
          status: "in_progress",
          completed_at: null,
          updated_at: "new",
        },
        error: null,
      });
    expect(
      (
        await transitionTaskStatusAction({
          ...input,
          expectedStatus: "completed",
          targetStatus: "in_progress",
        })
      ).success,
    ).toBe(true);
    expect(query.update).toHaveBeenCalledWith({
      status: "in_progress",
      completed_at: null,
    });
    expect(mocks.schedule).toHaveBeenCalledWith({
      userId: task.user_id,
      source: "task-transition",
    });
  });
  it("rejects missing/unowned tasks", async () => {
    query.maybeSingle
      .mockReset()
      .mockResolvedValue({ data: null, error: null });
    expect(await transitionTaskStatusAction(input)).toMatchObject({
      success: false,
      message: "taskNotFound",
    });
    expect(query.update).not.toHaveBeenCalled();
  });
  it("contains database failures", async () => {
    query.maybeSingle
      .mockReset()
      .mockResolvedValueOnce({ data: task, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "failed" } });
    expect(await transitionTaskStatusAction(input)).toMatchObject({
      success: false,
      message: "transitionFailed",
    });
    expect(mocks.schedule).not.toHaveBeenCalled();
  });
  function editInput(status: typeof task.status) {
    return {
      taskId: task.id,
      title: task.title,
      description: "",
      goalId: "",
      priority: task.priority,
      dueAt: "",
      status,
      expectedStatus: task.status,
      expectedUpdatedAt: task.updated_at,
    };
  }
  it.each(["overdue", "in_review"] as const)(
    "generic update cannot bypass the %s rule",
    async (status) => {
      expect(await updateTaskAction(editInput(status))).toMatchObject({
        success: false,
        message: "invalidTransition",
      });
      expect(query.update).not.toHaveBeenCalled();
    },
  );
  it("generic update supports rescheduling without changing workflow", async () => {
    query.maybeSingle
      .mockReset()
      .mockResolvedValueOnce({
        data: { ...task, due_at: "2000-01-01T00:00:00Z" },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: task.id }, error: null });
    expect(
      (
        await updateTaskAction({
          ...editInput("todo"),
          dueAt: "2099-01-01T00:00:00Z",
        })
      ).success,
    ).toBe(true);
  });
  it("generic edits preserve historical completion, ignoring caller timestamps", async () => {
    const completed_at = "2026-10-01T00:00:00Z";
    query.maybeSingle
      .mockReset()
      .mockResolvedValueOnce({
        data: { ...task, status: "completed", completed_at },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: task.id }, error: null });
    expect(
      (
        await updateTaskAction({
          ...editInput("completed"),
          expectedStatus: "completed",
          completedAt: "2099-01-01",
        } as Parameters<typeof updateTaskAction>[0])
      ).success,
    ).toBe(true);
    expect(query.update).toHaveBeenCalledWith(
      expect.objectContaining({ completed_at }),
    );
  });
});
