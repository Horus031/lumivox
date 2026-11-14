import type { NativeTaskRiskAlert, NativeTaskRiskBand } from "./native-task-risk.types";

import type { TaskRiskRecoveryUiAction, TaskRiskViewState } from "./task-risk-presentation.types";

const BASE_ALERT: NativeTaskRiskAlert = {
  prediction_id: "00000000-0000-4000-8000-000000000101",
  task_id: "00000000-0000-4000-8000-000000000102",
  goal_id: null,
  task_title: "Complete database revision",
  goal_title: null,

  risk_probability: 0.76,
  predicted_label: true,
  decision_threshold: 0.4,
  risk_score: 76,
  risk_band: "high",

  reason_summaries: [
    {
      title: "Deadline is approaching",
      description: "The current deadline leaves limited time for the estimated workload.",
      severity: "warning",
    },
    {
      title: "Recent focus activity is limited",
      description: "Recent study activity may not be sufficient for the remaining work.",
      severity: "warning",
    },
  ],

  recommended_actions: [],

  days_until_due: 2,
  due_at: "2026-11-16T18:00:00.000Z",

  model_key: "native_task_delay_risk_classifier",
  model_version: "native-task-risk-v2-20260925-021822",
  algorithm: "logistic_regression_balanced",
  predicted_at: "2026-11-14T09:00:00.000Z",

  top_attributions: [],
};

function readyState(band: NativeTaskRiskBand, probability: number): TaskRiskViewState {
  return {
    status: "ready",
    alert: {
      ...BASE_ALERT,
      risk_band: band,
      risk_probability: probability,
      risk_score: Math.round(probability * 100),
      predicted_label: probability >= BASE_ALERT.decision_threshold,
    },
  };
}

export type TaskRiskFixtureKey =
  | "high"
  | "elevated"
  | "moderate"
  | "low"
  | "stale"
  | "loading"
  | "unavailable"
  | "ineligible";

export const TASK_RISK_UI_FIXTURES: ReadonlyArray<{
  id: TaskRiskFixtureKey;
  state: TaskRiskViewState;
}> = [
  {
    id: "high",
    state: readyState("high", 0.76),
  },
  {
    id: "elevated",
    state: readyState("elevated", 0.58),
  },
  {
    id: "moderate",
    state: readyState("moderate", 0.37),
  },
  {
    id: "low",
    state: readyState("low", 0.18),
  },
  {
    id: "stale",
    state: { status: "stale" },
  },
  {
    id: "loading",
    state: { status: "loading" },
  },
  {
    id: "unavailable",
    state: { status: "unavailable" },
  },
  {
    id: "ineligible",
    state: { status: "ineligible" },
  },
];

export const TASK_RISK_UI_ACTIONS: readonly TaskRiskRecoveryUiAction[] = [
  {
    id: "start-focus",
    type: "start_focus",
    enabled: true,
  },
  {
    id: "split-task",
    type: "split_task",
    enabled: true,
  },
  {
    id: "increase-study-frequency",
    type: "increase_study_frequency",
    enabled: false,
  },
  {
    id: "reschedule",
    type: "reschedule",
    enabled: true,
  },
  {
    id: "reduce-scope",
    type: "reduce_scope",
    enabled: true,
  },
];
