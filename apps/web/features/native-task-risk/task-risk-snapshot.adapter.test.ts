// @vitest-environment node

import { describe, expect, it } from "vitest";

import { workspaceTask } from "@/features/workspace/workspace.test-fixtures";

import {
  resolveTaskRiskSnapshot,
  type TaskRiskSnapshotRow,
} from "./task-risk-snapshot.adapter";

const NOW = new Date("2026-11-14T10:00:00.000Z");
const DUE_AT = "2026-11-16T18:00:00.000Z";

function validTask() {
  return workspaceTask({
    due_at: DUE_AT,
    updated_at: "2026-11-14T08:00:00.000Z",
  });
}

function validRow(): TaskRiskSnapshotRow {
  return {
    task_id: validTask().id,
    task_title: "Study task",
    goal_id: null,
    goal_title: null,
    task_status: "todo",
    task_updated_at: "2026-11-14T08:00:00.000Z",
    task_completed_at: null,
    effective_due_at: DUE_AT,

    current_input_revision: 12,

    prediction_id: "00000000-0000-4000-8000-000000000201",
    predicted_at: "2026-11-14T09:00:00.000Z",
    risk_probability: 0.76,
    predicted_label: true,
    decision_threshold: 0.4,

    prediction_metadata: {
      prediction_mode: "native_ml",
      input_revision: 12,
      feature_schema_version: "native-task-risk-v2",
      risk_score: 76,
      risk_band: "high",
      due_at: DUE_AT,
      reason_summaries: [],
      recommended_actions: [],
    },

    model_key: "native_task_delay_risk_classifier",
    model_version: "native-task-risk-v2-20260925-021822",
    algorithm: "logistic_regression_balanced",
    model_active: true,
    top_attributions: [],
  };
}

describe("Task Risk Snapshot Adapter", () => {
  it("accepts a valid owned-task snapshot contract", () => {
    const result = resolveTaskRiskSnapshot(validTask(), validRow(), NOW);

    expect(result.status).toBe("ready");

    if (result.status === "ready") {
      expect(result.alert.risk_probability).toBe(0.76);
      expect(result.alert.risk_band).toBe("high");
    }
  });

  it("marks predictions stale after input revision changes", () => {
    const result = resolveTaskRiskSnapshot(
      validTask(),
      {
        ...validRow(),
        current_input_revision: 13,
      },
      NOW,
    );

    expect(result.status).toBe("stale");
  });

  it("marks legacy predictions without revision metadata stale", () => {
    const row = validRow();

    const result = resolveTaskRiskSnapshot(
      validTask(),
      {
        ...row,
        prediction_metadata: {
          prediction_mode: "native_ml",
          risk_band: "high",
          risk_score: 76,
          due_at: DUE_AT,
          reason_summaries: [],
          recommended_actions: [],
        },
      },
      NOW,
    );

    expect(result.status).toBe("stale");
  });

  it("does not accept a deterministic fallback as native ML", () => {
    const row = validRow();

    const result = resolveTaskRiskSnapshot(
      validTask(),
      {
        ...row,
        prediction_metadata: {
          ...(row.prediction_metadata as object),
          prediction_mode: "deterministic_fallback",
        },
      },
      NOW,
    );

    expect(result.status).toBe("unavailable");
  });

  it("invalidates a changed deadline", () => {
    const result = resolveTaskRiskSnapshot(
      validTask(),
      {
        ...validRow(),
        effective_due_at: "2026-11-17T18:00:00.000Z",
      },
      NOW,
    );

    expect(result.status).toBe("stale");
  });

  it("invalidates snapshots older than six hours", () => {
    const result = resolveTaskRiskSnapshot(
      validTask(),
      {
        ...validRow(),
        predicted_at: "2026-11-14T02:00:00.000Z",
      },
      NOW,
    );

    expect(result.status).toBe("stale");
  });

  it("invalidates a snapshot across UTC dates", () => {
    const task = workspaceTask({
      ...validTask(),
      updated_at: "2026-11-13T20:00:00.000Z",
    });

    const result = resolveTaskRiskSnapshot(
      task,
      {
        ...validRow(),
        task_updated_at: "2026-11-13T20:00:00.000Z",
        predicted_at: "2026-11-13T23:30:00.000Z",
      },
      new Date("2026-11-14T01:00:00.000Z"),
    );

    expect(result.status).toBe("stale");
  });

  it("does not expose completed tasks as active risk", () => {
    const task = workspaceTask({
      ...validTask(),
      status: "completed",
      completed_at: NOW.toISOString(),
    });

    const result = resolveTaskRiskSnapshot(task, validRow(), NOW);

    expect(result.status).toBe("ineligible");
  });

  it("treats overdue tasks separately from future risk", () => {
    const result = resolveTaskRiskSnapshot(
      workspaceTask({
        due_at: "2026-11-13T10:00:00.000Z",
      }),
      validRow(),
      NOW,
    );

    expect(result.status).toBe("ineligible");
  });

  it("does not interpret missing predictions as low risk", () => {
    const result = resolveTaskRiskSnapshot(validTask(), undefined, NOW);

    expect(result.status).toBe("unavailable");
  });

  it("rejects snapshots from inactive models", () => {
    const result = resolveTaskRiskSnapshot(
      validTask(),
      {
        ...validRow(),
        model_active: false,
      },
      NOW,
    );

    expect(result.status).toBe("stale");
  });
});
