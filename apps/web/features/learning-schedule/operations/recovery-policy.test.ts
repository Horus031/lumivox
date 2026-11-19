import { expect, it } from "vitest";
import { recommendNotificationRecovery, type NotificationRecoveryFacts } from "./recovery-policy";

const retryable: NotificationRecoveryFacts = {
  job: "leased",
  delivery: null,
  eligible: true,
  attemptCount: 1,
  leaseActive: false,
};

it("recommends retry only after a pre-handoff lease is no longer active", () => {
  expect(recommendNotificationRecovery(retryable)).toBe("safe_to_retry");
  expect(recommendNotificationRecovery({ ...retryable, leaseActive: true })).toBe(
    "hold_for_review",
  );
});
it.each(["submitting", "uncertain"] as const)(
  "holds %s even after the job failed or consent changed",
  (delivery) => {
    expect(
      recommendNotificationRecovery({ ...retryable, job: "failed", eligible: false, delivery }),
    ).toBe("hold_for_review");
  },
);
it.each(["sent", "expired", "suppressed", "failed"] as const)(
  "treats a known %s job as terminal",
  (job) => {
    expect(recommendNotificationRecovery({ ...retryable, job })).toBe("terminal");
  },
);
it("does not retry a known accepted handoff, exhausted budget or ineligible job", () => {
  expect(recommendNotificationRecovery({ ...retryable, delivery: "accepted" })).toBe("terminal");
  expect(recommendNotificationRecovery({ ...retryable, attemptCount: 3 })).toBe("terminal");
  expect(recommendNotificationRecovery({ ...retryable, eligible: false })).toBe("terminal");
});
