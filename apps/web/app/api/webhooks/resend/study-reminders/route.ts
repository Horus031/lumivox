import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { handleStudyReminderWebhook, type StudyReminderEvent } from "@/features/learning-schedule/notifications/resend-webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signingSecret = process.env.RESEND_STUDY_REMINDER_WEBHOOK_SECRET;
  const identityKey = process.env.STUDY_REMINDER_RECIPIENT_HMAC_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!signingSecret?.startsWith("whsec_") || !identityKey || identityKey.length < 32 || !url || !key) {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }
  return handleStudyReminderWebhook(request, {
    signingSecret, identityKey,
    persist: async (event: StudyReminderEvent) => {
      // Create privileged client only AFTER signature and payload validation.
      // Endpoint target/credentials are server config, never request identity.
      const db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await db.rpc("ls_notification_ingest_resend", {
        p_event_id: event.eventId, p_message_id: event.messageId, p_event_type: event.eventType,
        p_event_at: event.eventAt, p_recipient_fingerprint: event.recipientFingerprint,
        p_payload_fingerprint: event.payloadFingerprint,
        ...(event.bounceKind ? { p_bounce_kind: event.bounceKind } : {}),
      }).abortSignal(AbortSignal.timeout(4000));
      if (error) throw { code: error.code };
    },
  });
}
