import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { configuredReminderRecipients } from "./resolve-reminder-context";
import { reminderEncryptionKey } from "./resend-payload";
import {
  dispatchResendReminders,
  type ResendDispatchStore,
  type ResendDispatchConfig,
} from "./resend-reminder-dispatcher";
import type { EmailTransport } from "./reminder-provider.types";
const command = z
  .object({
    dryRun: z.boolean().default(true),
    batchSize: z.number().int().min(1).max(5).default(5),
  })
  .strict();
export function authenticateReminderDispatcher(
  header: string | null,
  secret: string | undefined,
) {
  if (
    !secret ||
    secret.length < 32 ||
    !header?.startsWith("Bearer ") ||
    header.length > 512
  )
    return false;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(header.slice(7)), hash(secret));
}
type Ports = {
  store: () => ResendDispatchStore;
  transport: (key: string, from: string) => EmailTransport;
  log?: (entry: {
    batchId: string;
    durationMs: number;
    classification: string;
    counts?: Record<string, number>;
  }) => void;
};
export async function handleResendDispatch(
  request: Request,
  env: Readonly<Record<string, string | undefined>>,
  ports: Ports,
): Promise<Response> {
  const response = (status: number, error: string) =>
    Response.json(
      { error },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  if (
    !authenticateReminderDispatcher(
      request.headers.get("authorization"),
      env.STUDY_REMINDER_DISPATCH_SECRET,
    )
  )
    return response(401, "unauthorized");
  const controller = new AbortController();
  const reader = request.body?.getReader();
  let size = 0;
  const parts: Uint8Array[] = [];
  const timer = setTimeout(() => {
    controller.abort();
    void reader?.cancel().catch(() => {});
  }, 2000);
  let input: z.infer<typeof command>;
  try {
    if (
      !reader ||
      request.headers.get("content-type")?.split(";")[0] !== "application/json"
    )
      throw new Error();
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 512) {
        await reader.cancel();
        throw new Error();
      }
      parts.push(part.value);
    }
    if (controller.signal.aborted) throw new Error();
    input = command.parse(JSON.parse(Buffer.concat(parts).toString("utf8")));
  } catch {
    return response(400, "invalid_request");
  } finally {
    clearTimeout(timer);
    reader?.releaseLock();
  }
  if (!input.dryRun && env.STUDY_REMINDER_REAL_SEND_ENABLED !== "true")
    return response(503, "real_send_disabled");

  let config: ResendDispatchConfig;
  try {
    if (
      !env.STUDY_REMINDER_RECIPIENT_HMAC_KEY ||
      env.STUDY_REMINDER_RECIPIENT_HMAC_KEY.length < 32 ||
      !env.STUDY_REMINDER_FROM ||
      !env.STUDY_REMINDER_TRUSTED_ORIGIN
    )
      throw new Error();
    const origin = new URL(env.STUDY_REMINDER_TRUSTED_ORIGIN);
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      throw new Error();
    const publicOrigin = env.STUDY_REMINDER_PUBLIC_UNSUBSCRIBE_ORIGIN
      ? new URL(env.STUDY_REMINDER_PUBLIC_UNSUBSCRIBE_ORIGIN) : undefined;
    if (publicOrigin && (
      publicOrigin.protocol !== "https:" || publicOrigin.username || publicOrigin.password ||
      publicOrigin.pathname !== "/" || publicOrigin.search || publicOrigin.hash
    )) throw new Error();
    config = {
      enabled: env.STUDY_REMINDER_REAL_SEND_ENABLED === "true",
      allowlist: configuredReminderRecipients(
        env.STUDY_REMINDER_TEST_RECIPIENTS ?? "",
      ),
      identityKey: env.STUDY_REMINDER_RECIPIENT_HMAC_KEY,
      encryptionKey: reminderEncryptionKey(
        env.STUDY_REMINDER_PAYLOAD_ENCRYPTION_KEY ?? "",
      ),
      from: env.STUDY_REMINDER_FROM,
      trustedOrigin: origin.origin,
      publicUnsubscribeOrigin: publicOrigin?.origin,
    };
    if (
      !input.dryRun &&
      (!env.RESEND_STUDY_REMINDER_API_KEY || env.RESEND_DEBUG === "true")
    )
      throw new Error();
  } catch {
    return response(503, "not_configured");
  }
  const started = Date.now(),
    batchId = randomUUID();
  try {
    const store = ports.store();
    // Lazy transport: even construction cannot occur unless a committed handoff
    // is ready; dry-run, DB-OFF and ineligible contexts never construct SDK.
    const transport: EmailTransport = {
      send: (email) =>
        ports
          .transport(env.RESEND_STUDY_REMINDER_API_KEY!, config.from)
          .send(email),
    };
    const counts = await dispatchResendReminders(
      store,
      transport,
      config,
      input,
    );
    ports.log?.({
      batchId,
      durationMs: Date.now() - started,
      classification: input.dryRun ? "dry_run" : "completed",
      counts,
    });
    return Response.json(
      { batchId, counts },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    ports.log?.({
      batchId,
      durationMs: Date.now() - started,
      classification: "persistence_unavailable",
    });
    return response(503, "dispatch_unavailable");
  }
}
