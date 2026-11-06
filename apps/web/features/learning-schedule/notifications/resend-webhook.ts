import { createHash, createHmac } from "node:crypto";
import { Resend } from "resend";
import { z } from "zod";

export const webhookBodyLimit = 32 * 1024;
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,256}$/);
const eventType = z.enum(["email.sent", "email.delivered", "email.delivery_delayed",
  "email.bounced", "email.complained", "email.failed", "email.suppressed"]);
const eventSchema = z.object({
  type: eventType, created_at: z.iso.datetime({ offset: true }),
  data: z.object({ email_id: identifier, to: z.array(z.email().max(254)).length(1) }),
});
export type StudyReminderEvent = {
  eventId: string; messageId: string; eventType: z.infer<typeof eventType>;
  eventAt: string; recipientFingerprint: string; payloadFingerprint: string;
};

/** Same versioned HMAC policy must be used by the future trusted handoff.
 * Lowercase domain only: local-part case is preserved, no Gmail-style aliases.
 * Rotate only with a migration/reconciliation plan for existing snapshots. */
export function reminderRecipientFingerprint(email: string, key: string) {
  const address = z.email().max(254).parse(email);
  if (key.length < 32) throw new Error("Missing identity fingerprint configuration");
  const separator = address.lastIndexOf("@");
  return createHmac("sha256", key).update(`resend-recipient-v1:${address.slice(0, separator)}@${address.slice(separator + 1).toLowerCase()}`).digest("hex");
}

export function verifyResendWebhook(rawBody: string, headers: Headers, secret: string): unknown {
  const id = identifier.parse(headers.get("svix-id"));
  const timestamp = headers.get("svix-timestamp");
  const signature = headers.get("svix-signature");
  if (!timestamp || !/^\d{1,12}$/.test(timestamp) || !signature || signature.length > 2048) {
    throw new Error("Invalid signature headers");
  }
  // SDK helper is local verification only. This inert value is NOT an API key;
  // no send, retrieval, account configuration or outbound request is performed.
  return new Resend("verification-only-no-api-access").webhooks.verify({
    payload: rawBody, headers: { id, timestamp, signature }, webhookSecret: secret,
  });
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function parseStudyReminderEvent(verifiedPayload: unknown, eventId: string, identityKey: string): StudyReminderEvent {
  const parsed = eventSchema.parse(verifiedPayload);
  // Hash the entire verified JSON, including fields we deliberately do not store.
  // Property order/whitespace does not make an otherwise exact replay conflict.
  return {
    eventId: identifier.parse(eventId), messageId: parsed.data.email_id,
    eventType: parsed.type, eventAt: parsed.created_at,
    recipientFingerprint: reminderRecipientFingerprint(parsed.data.to[0], identityKey),
    payloadFingerprint: createHash("sha256").update(canonical(verifiedPayload)).digest("hex"),
  };
}

type Dependencies = {
  signingSecret: string; identityKey: string;
  persist: (event: StudyReminderEvent) => Promise<void>;
};

async function readBoundedBody(request: Request): Promise<string> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > webhookBodyLimit)) throw new Error("body_size");
  if (!request.body) throw new Error("body_empty");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 5000);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > webhookBodyLimit) { await reader.cancel(); throw new Error("body_size"); }
      chunks.push(value);
    }
    if (timedOut) throw new Error("body_timeout");
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } finally { clearTimeout(timeout); reader.releaseLock(); }
}

/** No acknowledgement until the single DB command commits. No raw payloads,
 * addresses, keys or DB diagnostics are returned/logged. */
export async function handleStudyReminderWebhook(request: Request, dependencies: Dependencies): Promise<Response> {
  let raw: string;
  try { raw = await readBoundedBody(request); }
  catch { return Response.json({ error: "invalid_body" }, { status: 413 }); }
  let verified: unknown;
  try { verified = verifyResendWebhook(raw, request.headers, dependencies.signingSecret); }
  catch { return Response.json({ error: "invalid_signature" }, { status: 401 }); }
  let event: StudyReminderEvent;
  try { event = parseStudyReminderEvent(verified, request.headers.get("svix-id")!, dependencies.identityKey); }
  catch { return Response.json({ error: "invalid_event" }, { status: 400 }); }
  try { await dependencies.persist(event); }
  catch (error) {
    const conflict = error !== null && typeof error === "object" && "code" in error && error.code === "22023";
    if (conflict) console.warn("study_reminder_webhook_integrity_conflict");
    return Response.json({ error: conflict ? "event_integrity_conflict" : "persistence_unavailable" }, { status: conflict ? 409 : 503 });
  }
  return Response.json({ received: true });
}
