import { describe, expect, it } from "vitest";
import { TASK_STATUS_VALUES } from "./task-status";
import {
  canDirectlyTransitionTask,
  getTaskBoardStatus,
  getTaskCompletedAt,
  isDirectTaskStatusTarget,
  DIRECT_TASK_STATUS_TARGETS,
} from "./task-transition";
import { transitionTaskStatusSchema } from "./task.schemas";

const now = new Date("2026-10-04T12:00:00Z");

describe("getTaskBoardStatus", () => {
  it.each(TASK_STATUS_VALUES)(
    "derives past-due %s with terminal/review precedence",
    (status) => {
      const expected = ["completed", "cancelled", "in_review"].includes(status)
        ? status
        : "overdue";
      expect(
        getTaskBoardStatus({ status, due_at: "2026-10-03T12:00:00Z" }, now),
      ).toBe(expected);
    },
  );
  it.each([null, "invalid", "2026-10-05T12:00:00Z", now.toISOString()])(
    "does not mark %s overdue",
    (due_at) => {
      expect(getTaskBoardStatus({ status: "todo", due_at }, now)).toBe("todo");
      expect(getTaskBoardStatus({ status: "overdue", due_at }, now)).toBe(
        "in_progress",
      );
    },
  );
  it("rescheduling returns the task to its persisted workflow", () => {
    expect(
      getTaskBoardStatus(
        { status: "in_progress", due_at: "2026-10-05T12:00:00Z" },
        now,
      ),
    ).toBe("in_progress");
  });
});

describe("direct transitions", () => {
  const allowed = {
    todo: ["in_progress", "completed", "cancelled"],
    in_progress: ["todo", "completed", "cancelled"],
    completed: ["in_progress"],
    cancelled: ["todo", "in_progress"],
    overdue: ["completed", "cancelled"],
    in_review: [],
  };
  for (const from of TASK_STATUS_VALUES) {
    for (const to of DIRECT_TASK_STATUS_TARGETS) {
      it(`${from} -> ${to}`, () => {
        expect(canDirectlyTransitionTask(from, to)).toBe(
          (allowed[from] as string[]).includes(to),
        );
      });
    }
  }
  it.each(["overdue", "in_review", "invalid"])(
    "rejects direct target %s at the schema boundary",
    (targetStatus) => {
      expect(isDirectTaskStatusTarget(targetStatus)).toBe(false);
      expect(
        transitionTaskStatusSchema.safeParse({
          taskId: "00000000-0000-4000-8000-000000000001",
          targetStatus,
          expectedStatus: "todo",
          expectedUpdatedAt: now.toISOString(),
        }).success,
      ).toBe(false);
    },
  );
});

describe("completion timestamp", () => {
  it("sets completion once, preserves it on edits, and clears it on reopen", () => {
    expect(
      getTaskCompletedAt(
        { status: "todo", completed_at: null },
        "completed",
        now,
      ),
    ).toBe(now.toISOString());
    const completed = {
      status: "completed" as const,
      completed_at: "2026-10-01T00:00:00Z",
    };
    expect(getTaskCompletedAt(completed, "completed", now)).toBe(
      completed.completed_at,
    );
    expect(getTaskCompletedAt(completed, "in_progress", now)).toBeNull();
  });
});
