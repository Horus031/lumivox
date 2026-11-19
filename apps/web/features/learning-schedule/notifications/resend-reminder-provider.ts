import type { Resend } from "resend";
import { z } from "zod";
import type { EmailTransport, SubmissionResult } from "./reminder-provider.types";

// Type-only SDK import: no client, key lookup, fetch or singleton at import.
export type ResendReminderClient = { emails: Pick<Resend["emails"], "send"> };
const control = /[\u0000-\u001f\u007f\u2028\u2029]/u;
const singleLine = z
  .string()
  .min(1)
  .refine((value) => !control.test(value));
const sender = singleLine.max(320).refine((value) => {
  const address = value.match(/^[^<>]+ <([^<>\s]+)>$/)?.[1] ?? value;
  return z.email().safeParse(address).success;
});
export const reminderEmailSchema = z
  .object({
    recipient: z.email().max(254),
    from: sender,
    subject: singleLine.max(250),
    html: z.string().min(1).max(100000),
    text: z.string().min(1).max(100000),
    idempotencyKey: z.string().regex(/^[\x21-\x7e]{1,256}$/),
    unsubscribeUrl: singleLine
      .max(2048)
      .refine((value) => {
        try {
          const url = new URL(value);
          return (
            url.protocol === "https:" &&
            !url.username &&
            !url.password &&
            !url.hash &&
            url.pathname === "/api/study-reminders/unsubscribe" &&
            url.searchParams.getAll("token").length === 1 &&
            [...url.searchParams.keys()].length === 1 &&
            /^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get("token") ?? "")
          );
        } catch {
          return false;
        }
      })
      .optional(),
  })
  .strict();
const providerError = z.object({ name: z.string(), statusCode: z.number().int().nullable() });
const messageId = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/);

/** Inert 8A adapter. Requires an explicitly injected client + server-configured
 * sender; no environment-based activation, dispatcher wiring or retries.
 * All 8A calls inject a mock. A real SDK client may only be supplied at a future
 * trusted worker boundary after persistence/webhooks/unsubscribe are ready. */
export class ResendReminderProvider implements EmailTransport {
  private readonly client: ResendReminderClient;
  private readonly approvedFrom: string;

  constructor(client: ResendReminderClient, approvedFrom: string) {
    if (typeof window !== "undefined") throw new Error("Reminder transport is server-only");
    if (!sender.safeParse(approvedFrom).success)
      throw new Error("Invalid configured reminder sender");
    this.client = client;
    this.approvedFrom = approvedFrom;
  }

  async send(raw: unknown): Promise<SubmissionResult> {
    const parsed = reminderEmailSchema.safeParse(raw);
    if (!parsed.success) return { kind: "rejected", code: "invalid_request", retryable: false };
    const email = parsed.data;
    if (email.from !== this.approvedFrom)
      return { kind: "rejected", code: "sender_not_approved", retryable: false };
    try {
      // Exact field projection: no attachments, private notes, CC/BCC, metadata,
      // headers, document contents or caller-selected endpoint can leak through.
      const result: unknown = await this.client.emails.send(
        {
          from: email.from,
          to: [email.recipient],
          subject: email.subject,
          html: email.html,
          text: email.text,
          ...(email.unsubscribeUrl
            ? {
                headers: {
                  "List-Unsubscribe": `<${email.unsubscribeUrl}>`,
                  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                },
              }
            : {}),
        },
        { idempotencyKey: email.idempotencyKey, signal: AbortSignal.timeout(10000) },
      );
      if (!result || typeof result !== "object" || !("error" in result) || !("data" in result)) {
        return { kind: "uncertain", code: "invalid_provider_response" };
      }
      if (result.error === null) {
        const data = z.object({ id: messageId }).safeParse(result.data);
        return data.success
          ? { kind: "accepted", providerMessageId: data.data.id }
          : { kind: "uncertain", code: "invalid_provider_response" };
      }
      if (result.data !== null) return { kind: "uncertain", code: "invalid_provider_response" };
      const error = providerError.safeParse(result.error);
      if (!error.success) return { kind: "uncertain", code: "invalid_provider_response" };
      const { name, statusCode } = error.data;
      if (statusCode === null) return { kind: "uncertain", code: "transport_error" };
      if (statusCode === 409 && name === "invalid_idempotent_request")
        return { kind: "rejected", code: "idempotency_payload_mismatch", retryable: false };
      if (statusCode === 409 && name === "concurrent_idempotent_requests")
        return { kind: "uncertain", code: "idempotency_in_flight" };
      if (statusCode === 429 && name === "rate_limit_exceeded")
        return { kind: "rejected", code: "rate_limited", retryable: true };
      if (statusCode === 429 && ["daily_quota_exceeded", "monthly_quota_exceeded"].includes(name))
        return { kind: "rejected", code: "quota_exceeded", retryable: false };
      if ([400, 422].includes(statusCode))
        return { kind: "rejected", code: "validation_rejected", retryable: false };
      if ([401, 403, 404, 405].includes(statusCode))
        return { kind: "rejected", code: "configuration_rejected", retryable: false };
      if (statusCode >= 500 && statusCode <= 599)
        return { kind: "uncertain", code: "provider_unavailable" };
      return { kind: "uncertain", code: "provider_outcome_unknown" };
    } catch {
      // A throw/timeout/5xx cannot establish nonacceptance. No raw errors or
      // recipient addresses are logged or returned, and no retry is performed.
      return { kind: "uncertain", code: "transport_error" };
    }
  }
}
