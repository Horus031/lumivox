import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { ResendDispatchStore } from "./resend-reminder-dispatcher";
import { payloadSnapshotSchema } from "./resend-payload";
import { z } from "zod";
const claimSchema = z.array(z.object({ jobId: z.uuid(), leaseToken: z.uuid() }).strict()).max(5);
const handoff = z
  .object({ authorized: z.boolean(), deliveryId: z.uuid().optional() })
  .passthrough();
function fail(error: unknown) {
  if (error) throw new Error("Reminder persistence unavailable");
}
/** Server-only construction. No cookies, browser client, caller-selected owner,
 * recipient or database endpoint. Each PostgREST RPC is a committed transaction. */
export function createResendDispatchStore(db: SupabaseClient<Database>): ResendDispatchStore {
  return {
    async gate() {
      const { data, error } = await db
        .from("study_notification_dispatch_control")
        .select("enabled")
        .eq("singleton", true)
        .abortSignal(AbortSignal.timeout(4000))
        .single();
      fail(error);
      return data?.enabled === true;
    },
    async preview(size) {
      const { data, error } = await db
        .rpc("ls_notification_preview_resend", { p_batch_size: size })
        .abortSignal(AbortSignal.timeout(4000));
      fail(error);
      return z.array(z.uuid()).max(5).parse(data);
    },
    async claim(size) {
      const { data, error } = await db
        .rpc("ls_notification_claim_batch", { p_batch_size: size })
        .abortSignal(AbortSignal.timeout(4000));
      fail(error);
      return claimSchema.parse(data);
    },
    async resolve(jobId, leaseToken) {
      const { data, error } = await db
        .rpc("ls_notification_resolve_resend_context", {
          p_job_id: jobId,
          ...(leaseToken ? { p_lease_token: leaseToken } : {}),
        })
        .abortSignal(AbortSignal.timeout(4000));
      fail(error);
      return data;
    },
    async load(claim) {
      const { data, error } = await db
        .rpc("ls_notification_load_resend_payload", {
          p_job_id: claim.jobId,
          p_lease_token: claim.leaseToken,
        })
        .abortSignal(AbortSignal.timeout(4000));
      fail(error);
      return data === null ? null : payloadSnapshotSchema.parse(data);
    },
    async prepare(claim, c, input) {
      const { data, error } = await db
        .rpc("ls_notification_prepare_resend_payload", {
          p_job_id: claim.jobId,
          p_lease_token: claim.leaseToken,
          p_context_hash: c.contextHash,
          p_expected_email: c.recipient,
          p_recipient_fingerprint: c.recipientFingerprint,
          p_payload_fingerprint: input.fingerprint,
          p_encrypted_payload: input.envelope,
          p_token_hash: input.tokenHash,
          p_locale: c.locale,
        })
        .abortSignal(AbortSignal.timeout(4000));
      fail(error);
      return payloadSnapshotSchema.parse(data);
    },
    async authorize(claim, c) {
      const { data, error } = await db
        .rpc("ls_notification_authorize_resend_payload", {
          p_job_id: claim.jobId,
          p_lease_token: claim.leaseToken,
          p_expected_email: c.recipient,
          p_recipient_fingerprint: c.recipientFingerprint,
        })
        .abortSignal(AbortSignal.timeout(4000));
      fail(error);
      return handoff.parse(data);
    },
    async record(claim, deliveryId, fingerprint, result) {
      if (result.kind === "rejected" && result.code === "rate_limited" && result.retryable) {
        const { error } = await db
          .rpc("ls_notification_record_resend_rate_limit", {
            p_delivery_id: deliveryId,
            p_handoff_token: claim.leaseToken,
            p_payload_fingerprint: fingerprint,
          })
          .abortSignal(AbortSignal.timeout(4000));
        fail(error);
        return;
      }
      const { error } = await db
        .rpc("ls_notification_record_resend_outcome", {
          p_delivery_id: deliveryId,
          p_handoff_token: claim.leaseToken,
          p_payload_fingerprint: fingerprint,
          p_outcome: result.kind,
          ...(result.kind === "accepted" ? { p_message_id: result.providerMessageId } : {}),
        })
        .abortSignal(AbortSignal.timeout(4000));
      fail(error);
    },
    async reconcile() {
      const { error } = await db
        .rpc("ls_notification_reconcile_expired_leases", { p_batch_size: 5 })
        .abortSignal(AbortSignal.timeout(4000));
      fail(error);
    },
  };
}
