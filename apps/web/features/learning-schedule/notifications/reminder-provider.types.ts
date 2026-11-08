/** Content/transport boundary only. The trusted worker must resolve the verified
 * Auth recipient, consent, suppression, immutable payload and persisted outbox
 * key BEFORE calling this port. None of those permissions are granted here. */
export type ReminderEmail = Readonly<{
  recipient: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  /** Trusted issuer only. Adapter derives exactly two fixed RFC 8058 headers. */
  unsubscribeUrl?: string;
}>;

export type ReminderEmailContent = Pick<ReminderEmail, "subject" | "html" | "text">;
export type SubmissionResult =
  | { kind: "accepted"; providerMessageId: string }
  | { kind: "rejected"; code: "invalid_request" | "sender_not_approved" | "validation_rejected" | "configuration_rejected" | "rate_limited" | "quota_exceeded" | "idempotency_payload_mismatch"; retryable: boolean }
  | { kind: "uncertain"; code: "transport_error" | "provider_unavailable" | "idempotency_in_flight" | "invalid_provider_response" | "provider_outcome_unknown" };

export interface EmailTransport {
  send(email: ReminderEmail): Promise<SubmissionResult>;
}
