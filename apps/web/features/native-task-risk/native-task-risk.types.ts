export type NativeTaskRiskBand = "low" | "moderate" | "elevated" | "high";

export type NativeTaskRiskAlert = {
  prediction_id: string;
  task_id: string;
  goal_id: string | null;
  task_title: string;
  goal_title: string | null;

  risk_probability: number;
  predicted_label: boolean;
  decision_threshold: number;
  risk_score: number;
  risk_band: NativeTaskRiskBand;
  reason_summaries: NativeTaskRiskReasonSummary[];
  recommended_actions: NativeTaskRiskRecommendedAction[];

  days_until_due: number | null;
  due_at: string | null;

  model_key: string;
  model_version: string;
  algorithm: string;

  predicted_at: string;

  top_attributions: {
    feature_name: string;
    feature_value: number;
    contribution: number;
    effect: "increases_risk" | "decreases_risk" | "neutral";
    rank: number;
  }[];
};

export type NativeTaskRiskCandidateTask = {
  task_id: string;
  goal_id: string | null;
  task_title: string;
  goal_title: string | null;
  priority: string;
  status: string;
  due_at: string;
  days_until_due: number;
};

export type NativeTaskRiskPredictionApiResponse = {
  user_id: string;
  task_id: string;
  goal_id: string | null;
  prediction_mode: "native_ml" | "deterministic_fallback";
  model_key: string;
  model_version: string;
  model_name: string;
  risk_probability: number;
  risk_score: number;
  risk_band: NativeTaskRiskBand;
  predicted_late: boolean;
  decision_threshold: number;
  days_until_due: number | null;
  due_at: string | null;
  features: Record<string, number>;
  reasons: {
    feature_name: string;
    feature_value: number;
    contribution: number;
    effect: "increases_risk" | "decreases_risk" | "neutral";
    reason: string;
  }[];
  prediction_id: string | null;
};

export type NativeTaskRiskBatchApiResponse = {
  predictions: NativeTaskRiskPredictionApiResponse[];
  errors: {
    task_id: string;
    error: string;
  }[];
};

export type NativeTaskRiskReasonSummary = {
  title: string;
  description: string;
  severity: "info" | "warning" | "critical";
};

export type NativeTaskRiskRecommendedAction = {
  action_id: string;
  label: string;
  description: string;
  action_type:
    | "start_focus"
    | "reschedule"
    | "split_task"
    | "reduce_scope"
    | "view_task";
  priority: number;
  payload: Record<string, unknown>;
};
