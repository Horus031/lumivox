export type NotificationRecoveryFacts = {
  job: "pending" | "leased" | "sent" | "suppressed" | "expired" | "failed";
  delivery:
    | "submitting"
    | "uncertain"
    | "accepted"
    | "delivered"
    | "failed"
    | "suppressed"
    | "bounced"
    | "complained"
    | null;
  eligible: boolean;
  attemptCount: number;
  leaseActive: boolean;
};

/** Recommendation for an operator. The worker's gates and RPCs still decide eligibility. */
export function recommendNotificationRecovery(
  facts: NotificationRecoveryFacts,
): "safe_to_retry" | "hold_for_review" | "terminal" {
  if (facts.delivery === "submitting" || facts.delivery === "uncertain") return "hold_for_review";
  if (facts.job !== "pending" && facts.job !== "leased") return "terminal";
  if (
    facts.delivery === "accepted" ||
    facts.delivery === "delivered" ||
    facts.delivery === "bounced" ||
    facts.delivery === "complained" ||
    facts.delivery === "suppressed"
  )
    return "terminal";
  if (!facts.eligible || facts.attemptCount >= 3) return "terminal";
  if (facts.leaseActive) return "hold_for_review";
  return "safe_to_retry";
}
