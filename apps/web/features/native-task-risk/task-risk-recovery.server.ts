import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database.types";
import type { TypedSupabaseClient } from "@/types/supabase.types";
import type { RecoveryAction } from "./task-risk-recovery.schemas";

export function recoveryWriter() {
  if (typeof window !== "undefined") throw new Error("Recovery writer is server-only");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Recovery tracking unavailable");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function getInitiatedRecovery(
  client: TypedSupabaseClient, attemptId: string | undefined, taskId: string | null,
  actions: RecoveryAction[],
) {
  if (!attemptId || !taskId || !z.uuid().safeParse(attemptId).success) return null;
  try {
    const { data, error } = await client.from("task_risk_recovery_attempts").select("id,action_type")
      .eq("id", attemptId).eq("task_id", taskId).eq("status", "initiated").in("action_type", actions).maybeSingle();
    if (error) return null;
    const action = actions.find(type => type === data?.action_type);
    return data && action ? { id: data.id, action } : null;
  } catch {
    return null;
  }
}

type RecoveryEvidence =
  | { action: "start_focus" | "split_task"; entityId: string }
  | { action: "reschedule" | "reduce_scope"; updatedAt: string; previousDueAt: string | null; previousMinutes: number | null };

export async function completeTaskRiskRecovery(
  userId: string, taskId: string, attemptId: string, evidence: RecoveryEvidence,
) {
  // The mutation is already committed. Retry only the idempotent evidence write.
  for (let retry = 0; retry < 2; retry++) {
    try {
      const { data, error } = await recoveryWriter().rpc("complete_verified_task_risk_recovery", {
        p_user_id: userId, p_task_id: taskId, p_attempt_id: attemptId, p_action_type: evidence.action,
        ...("entityId" in evidence ? { p_entity_id: evidence.entityId } : {
          p_task_updated_at: evidence.updatedAt,
          ...(evidence.previousDueAt === null ? {} : { p_previous_due_at: evidence.previousDueAt }),
          ...(evidence.previousMinutes === null ? {} : { p_previous_minutes: evidence.previousMinutes }),
        }),
      }).abortSignal(AbortSignal.timeout(2_000));
      if (!error && data) return;
    } catch {
      // A tracking outage cannot undo the committed user mutation.
    }
  }
  console.warn("task_risk_recovery_record_unavailable");
}
