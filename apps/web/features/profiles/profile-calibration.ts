import type { PbiWeightProfile, Profile } from "./profile.types";

export type ProfileCalibrationValues = {
  fullName: string;
  timezone: string;
  taskCompletionWeight: number;
  focusQualityWeight: number;
  deadlineAdherenceWeight: number;
  goalMomentumWeight: number;
  consistencyWeight: number;
};

export const DEFAULT_PBI_WEIGHTS = {
  taskCompletionWeight: 0.3,
  focusQualityWeight: 0.25,
  deadlineAdherenceWeight: 0.25,
  goalMomentumWeight: 0.1,
  consistencyWeight: 0.1,
};

export function initialCalibration(profile: Profile, weights: PbiWeightProfile): ProfileCalibrationValues {
  return {
    fullName: profile.full_name ?? "",
    timezone: profile.timezone || "Asia/Ho_Chi_Minh",
    taskCompletionWeight: Number(weights.task_completion_weight),
    focusQualityWeight: Number(weights.focus_quality_weight),
    deadlineAdherenceWeight: Number(weights.deadline_adherence_weight),
    goalMomentumWeight: Number(weights.goal_momentum_weight),
    consistencyWeight: Number(weights.consistency_weight),
  };
}

export function calibrationTotal(values: ProfileCalibrationValues) {
  return Object.keys(DEFAULT_PBI_WEIGHTS).reduce((sum, key) => sum + values[key as keyof typeof DEFAULT_PBI_WEIGHTS], 0);
}

export function isCalibrationValid(values: ProfileCalibrationValues) {
  return Object.keys(DEFAULT_PBI_WEIGHTS).every((key) => {
    const value = values[key as keyof typeof DEFAULT_PBI_WEIGHTS];
    return Number.isFinite(value) && value >= 0 && value <= 1;
  }) && Math.abs(calibrationTotal(values) - 1) <= 0.0001;
}
