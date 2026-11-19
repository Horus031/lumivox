import { z } from "zod";
import { reminderRecipientFingerprint } from "./resend-webhook";
const address = z.email().max(254);
export function canonicalReminderAddress(raw: string) {
  const email = address.parse(raw),
    at = email.lastIndexOf("@");
  return email.slice(0, at) + "@" + email.slice(at + 1).toLowerCase();
}
export function configuredReminderRecipients(raw: string): ReadonlySet<string> {
  const entries = raw.split(",").map((s) => s.trim());
  if (entries.length > 20 || entries.some((s) => !s || s.includes("*")))
    throw new Error("Invalid recipient configuration");
  return new Set(entries.map(canonicalReminderAddress));
}
const row = z
  .object({
    userId: z.uuid(),
    jobId: z.uuid(),
    sessionId: z.uuid(),
    taskId: z.uuid(),
    taskTitle: z.string().min(1).max(500),
    recipient: z.string().nullable(),
    verified: z.boolean(),
    locale: z.enum(["en", "vi"]).nullable(),
    localeConfirmed: z.boolean(),
    scheduledStartAt: z.iso.datetime({ offset: true }),
    scheduledEndAt: z.iso.datetime({ offset: true }),
    timezone: z.string(),
    leadMinutes: z.union([z.literal(5), z.literal(15), z.literal(30), z.literal(60)]),
    idempotencyKey: z.string().min(1).max(256),
    lifecycleFingerprint: z.string().nullable(),
    eligible: z.boolean(),
    contextHash: z.string().regex(/^[a-f0-9]{64}$/),
    suppressed: z.boolean(),
  })
  .strict();
export type ResolvedReminderContext = Omit<z.infer<typeof row>, "recipient" | "locale"> & {
  recipient: string;
  locale: "en" | "vi";
  recipientFingerprint: string;
};
export type ResolveReminderResult =
  | { success: true; context: ResolvedReminderContext }
  | {
      success: false;
      reason:
        | "not_found"
        | "not_verified"
        | "not_allowlisted"
        | "not_eligible"
        | "incomplete_context";
    };
export function resolveReminderContext(
  raw: unknown,
  allowlist: ReadonlySet<string>,
  identityKey: string,
): ResolveReminderResult {
  if (raw === null) return { success: false, reason: "not_found" };
  const parsed = row.safeParse(raw);
  if (!parsed.success) return { success: false, reason: "incomplete_context" };
  const c = parsed.data;
  if (!c.verified || !c.recipient || !address.safeParse(c.recipient).success)
    return { success: false, reason: "not_verified" };
  if (!allowlist.has(canonicalReminderAddress(c.recipient)))
    return { success: false, reason: "not_allowlisted" };
  if (!c.locale || !c.localeConfirmed) return { success: false, reason: "incomplete_context" };
  if (!c.eligible || c.suppressed) return { success: false, reason: "not_eligible" };
  return {
    success: true,
    context: {
      ...c,
      recipient: c.recipient,
      locale: c.locale,
      recipientFingerprint: reminderRecipientFingerprint(c.recipient, identityKey),
    },
  };
}
