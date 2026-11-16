import { describe, expect, it } from "vitest";
import { compareRecoveryPredictions } from "./task-risk-recovery-comparison";

const attempt = { appliedAt: "2026-11-16T10:00:00Z", reassessmentId: "after" };
const source = { model_version_id: "v1", risk_probability: 0.76 };
const fresh = { id: "after", model_version_id: "v1", risk_probability: 0.54, predictedAt: "2026-11-16T10:01:00Z" };

describe("comparing recovery predictions", () => {
  it("computes the signed change in probability", () => {
    const comparison = compareRecoveryPredictions(attempt, source, fresh);
    expect(comparison).toMatchObject({ before: 0.76, after: 0.54 });
    expect(comparison?.delta).toBeCloseTo(-0.22);
  });

  it("omits the comparison when the freshness adapter does not provide a ready prediction", () => {
    expect(compareRecoveryPredictions(attempt, source, null)).toBeNull();
  });

  it("omits a new model version, unpaired or pre-mutation prediction", () => {
    expect(compareRecoveryPredictions(attempt, source, { ...fresh, model_version_id: "v2" })).toBeNull();
    expect(compareRecoveryPredictions(attempt, source, { ...fresh, id: "unpaired" })).toBeNull();
    expect(compareRecoveryPredictions(attempt, source, { ...fresh, predictedAt: attempt.appliedAt })).toBeNull();
  });
});
