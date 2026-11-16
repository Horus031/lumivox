import type { RecoveryHistoryItem } from "./task-risk-recovery.types";

type SourcePrediction = { risk_probability: number; model_version_id: string };
type FreshPrediction = SourcePrediction & { id: string; predictedAt: string };

export function compareRecoveryPredictions(
  attempt: { appliedAt: string | null; reassessmentId: string | null },
  source: SourcePrediction | undefined,
  fresh: FreshPrediction | null,
): RecoveryHistoryItem["comparison"] {
  if (!attempt.appliedAt || !source || !fresh ||
      fresh.id !== attempt.reassessmentId || fresh.model_version_id !== source.model_version_id ||
      !(Date.parse(fresh.predictedAt) > Date.parse(attempt.appliedAt))) return null;

  return {
    before: source.risk_probability,
    after: fresh.risk_probability,
    delta: fresh.risk_probability - source.risk_probability,
  };
}
