
import type {
  NativeTaskRiskAlert,
  NativeTaskRiskRecommendedAction,
} from "./native-task-risk.types";

export type TaskRiskViewState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ineligible" }
  | { status: "stale" }
  | {
      status: "ready";
      alert: NativeTaskRiskAlert;
    };

export type TaskRiskRecoveryActionType =
  | NativeTaskRiskRecommendedAction["action_type"]
  | "increase_study_frequency";

export type TaskRiskRecoveryUiAction = {
  id: string;
  type: TaskRiskRecoveryActionType;
  enabled: boolean;
};
