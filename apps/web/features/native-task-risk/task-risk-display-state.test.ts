import { describe, expect, it } from "vitest";

import { workspaceTask } from "@/features/workspace/workspace.test-fixtures";
import { TASK_RISK_UI_FIXTURES } from "./task-risk-ui.fixtures";

import { getTaskRiskDisplayState } from "./task-risk-display-state";

const NOW = new Date("2026-11-14T10:00:00.000Z");

const HIGH = TASK_RISK_UI_FIXTURES.find(
  (fixture) => fixture.id === "high",
)?.state;

if (!HIGH || HIGH.status !== "ready") {
  throw new Error("High-risk fixture is missing");
}

const task = workspaceTask({
  id: HIGH.alert.task_id,
  due_at: HIGH.alert.due_at,
  updated_at: "2026-11-14T08:00:00.000Z",
});

describe("Task Risk Client Display State", () => {
  it("keeps a valid risk snapshot ready", () => {
    const result = getTaskRiskDisplayState(task, HIGH, NOW);

    expect(result.status).toBe("ready");
  });

  it("invalidates after a local Task mutation", () => {
    const result = getTaskRiskDisplayState(task, HIGH, NOW, true);

    expect(result.status).toBe("stale");
  });

  it("invalidates when the deadline changes", () => {
    const result = getTaskRiskDisplayState(
      {
        ...task,
        due_at: "2026-11-17T18:00:00.000Z",
      },
      HIGH,
      NOW,
    );

    expect(result.status).toBe("stale");
  });

  it("invalidates after snapshot TTL expires", () => {
    const result = getTaskRiskDisplayState(
      task,
      HIGH,
      new Date("2026-11-14T16:01:00.000Z"),
    );

    expect(result.status).toBe("stale");
  });

  it("never displays active risk on a completed task", () => {
    const result = getTaskRiskDisplayState(
      {
        ...task,
        status: "completed",
        completed_at: NOW.toISOString(),
      },
      HIGH,
      NOW,
    );

    expect(result.status).toBe("ineligible");
  });

  it("never attaches risk from another Task", () => {
    const result = getTaskRiskDisplayState(
      { ...task, id: "different-task" },
      HIGH,
      NOW,
    );

    expect(result.status).toBe("unavailable");
  });

  it("does not turn a missing snapshot into low risk", () => {
    const result = getTaskRiskDisplayState(task, undefined, NOW);

    expect(result.status).toBe("unavailable");
  });
});
