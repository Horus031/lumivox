import { describe, expect, it } from "vitest";

import {
  resolveWorkspaceScope,
  groupWorkspaceTasksByStatus,
} from "./workspace.utils";
import { workspaceTask } from "./workspace.test-fixtures";
import { TASK_STATUS_VALUES } from "../tasks/task-status";

describe("workspace grouping", () => {
  const now = new Date("2026-10-04T12:00:00Z");
  it.each(TASK_STATUS_VALUES)(
    "groups past due %s using derived semantics",
    (status) => {
      const task = workspaceTask({ status, due_at: "2026-10-03T12:00:00Z" });
      const groups = groupWorkspaceTasksByStatus([task], now);
      const expected = ["completed", "cancelled", "in_review"].includes(status)
        ? status
        : "overdue";
      expect(groups[expected]).toEqual([task]);
      expect(Object.values(groups).flat()).toHaveLength(1);
    },
  );
  it("keeps all six lanes and the query order", () => {
    const tasks = [workspaceTask(), workspaceTask({ id: "second" })];
    const groups = groupWorkspaceTasksByStatus(tasks, now);
    expect(groups.todo).toEqual(tasks);
    expect(Object.keys(groups)).toHaveLength(6);
  });
  it("places future legacy overdue in progress", () => {
    const task = workspaceTask({
      status: "overdue",
      due_at: "2026-10-05T12:00:00Z",
    });
    expect(groupWorkspaceTasksByStatus([task], now).in_progress).toEqual([
      task,
    ]);
  });
});

describe("resolveWorkspaceScope", () => {
  const goalIds = ["goal-a", "goal-b"];

  it("defaults to all", () => {
    expect(resolveWorkspaceScope(undefined, goalIds)).toEqual({
      type: "all",
    });
  });

  it("supports unassigned tasks", () => {
    expect(resolveWorkspaceScope("unassigned", goalIds)).toEqual({
      type: "unassigned",
    });
  });

  it("uses an owned goal", () => {
    expect(resolveWorkspaceScope("goal-a", goalIds)).toEqual({
      type: "goal",
      goalId: "goal-a",
    });
  });

  it("rejects unknown goals", () => {
    expect(resolveWorkspaceScope("unknown", goalIds)).toEqual({
      type: "all",
    });
  });
});
