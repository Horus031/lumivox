"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { fetchAiApi } from "@/lib/ai-api/fetch-ai-api";
import { checkRateLimit } from "@/lib/redis/rate-limit";
import {
  recoveryActionSchema,
  recoveryStartSchema,
} from "./task-risk-recovery.schemas";
import { recoveryWriter } from "./task-risk-recovery.server";
import { compareRecoveryPredictions } from "./task-risk-recovery-comparison";
import { readRecoveryRisk } from "./task-risk-recovery.queries";
import { isTaskRiskEligible } from "./task-risk-snapshot.adapter";
import type { NativeTaskRiskBatchApiResponse } from "./native-task-risk.types";
import type { RecoveryHistoryItem } from "./task-risk-recovery.types";

export async function startTaskRiskRecoveryAction(input: unknown) {
  const parsed = recoveryStartSchema.safeParse(input);
  if (!parsed.success) return null;
  try {
    const { user, supabase } = await requireUser();
    const { taskId, predictionId, actionType, idempotencyKey } = parsed.data;
    const { data: existing, error: lookupError } = await supabase
      .from("task_risk_recovery_attempts")
      .select("id,task_id,source_prediction_id,action_type")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (lookupError) return null;
    if (existing) {
      return existing.task_id === taskId &&
        existing.source_prediction_id === predictionId &&
        existing.action_type === actionType
        ? existing.id
        : null;
    }

    const risk = await readRecoveryRisk(supabase, taskId, new Date());

    if (
      risk.status !== "ready" ||
      risk.alert.prediction_id !== predictionId ||
      risk.alert.risk_band === "low" ||
      !risk.alert.recommended_actions.some(
        (action) => action.action_type === actionType,
      )
    ) {
      return null;
    }
    const { data, error } = await recoveryWriter().rpc(
      "start_receipted_task_risk_recovery",
      {
        p_user_id: user.id,
        p_task_id: taskId,
        p_prediction_id: predictionId,
        p_action_type: actionType,
        p_key: idempotencyKey,
      },
    );
    return error ? null : data;
  } catch {
    return null;
  }
}

const reservationSchema = z.object({ kind: z.enum(["done", "persisted", "dispatch"]), id: z.uuid() });

export async function reassessTaskRiskAfterRecoveryAction(attemptId: string) {
  if (!z.uuid().safeParse(attemptId).success) return false;
  try {
    const { user, supabase } = await requireUser();
    const { data: attempt } = await supabase.from("task_risk_recovery_attempts")
      .select("task_id").eq("id", attemptId).eq("status", "applied").maybeSingle();
    if (!attempt) return false;

    const { data: task } = await supabase.from("tasks").select("status,completed_at,due_at,due_date")
      .eq("id", attempt.task_id).maybeSingle();
    if (!task || !isTaskRiskEligible(task, new Date())) return false;

    const quota = await checkRateLimit({ key: `task-risk-recovery:${user.id}`, limit: 10, window: "1 h", mode: "fail-closed" });
    const writer = recoveryWriter();
    const { data: reservation } = await writer.rpc("reserve_task_risk_reassessment", {
      p_user_id: user.id, p_attempt_id: attemptId, p_allow_dispatch: quota.success,
    });
    const job = reservationSchema.safeParse(reservation);
    if (!job.success) return false;
    if (job.data.kind === "done") return true;

    if (job.data.kind === "dispatch") {
      try {
        await fetchAiApi<NativeTaskRiskBatchApiResponse>({
          path: "/api/v1/native-task-risk/batch-predict",
          body: { user_id: user.id, task_ids: [attempt.task_id], persist: true, recovery_request_id: job.data.id },
          retries: 0,
        });
      } catch {
        // A timeout can follow a successful persist. Pair against the database.
      }
    }

    const { data } = await writer.rpc("pair_task_risk_reassessment", {
      p_user_id: user.id, p_attempt_id: attemptId, p_request_id: job.data.id,
    });
    return data === true;
  } catch {
    return false;
  }
}

export async function abandonTaskRiskRecoveryAction(attemptId: string) {
  if (!z.uuid().safeParse(attemptId).success) return false;
  try {
    const { supabase } = await requireUser();
    const { data } = await supabase.rpc("abandon_task_risk_recovery", { p_attempt_id: attemptId });
    return data === true;
  } catch {
    return false;
  }
}

export async function loadTaskRiskRecoveryHistoryAction(
  taskId: string,
): Promise<RecoveryHistoryItem[] | null> {
  if (!z.uuid().safeParse(taskId).success) return null;
  try {
    const { supabase, user } = await requireUser();
    const { data: attempts, error } = await supabase
      .from("task_risk_recovery_attempts")
      .select(
        "id,action_type,status,original_due_at,initiated_at,applied_at,source_prediction_id,reassessment_prediction_id,evaluated_at,receipt_required,receipt_recorded_at",
      )
      .eq("task_id", taskId)
      .order("initiated_at", { ascending: false })
      .limit(10);
    if (error) return null;
    if (!attempts?.length) return [];
    const ids = [...new Set(attempts.flatMap((attempt) => attempt.reassessment_prediction_id
      ? [attempt.source_prediction_id, attempt.reassessment_prediction_id] : []))];
    const { data: predictions } = ids.length ? await supabase.from("deadline_risk_predictions")
      .select("id,risk_probability,model_version_id,created_at,input_mode,prediction_metadata")
      .eq("task_id", taskId).eq("user_id", user.id).in("id", ids) : { data: [] };
    const metadata = z.object({
      prediction_mode: z.literal("native_ml"),
      feature_schema_version: z.literal("native-task-risk-v2"),
    });
    const verifiedPredictions = (predictions ?? []).filter((prediction) =>
      prediction.input_mode === "lumivox_native_features" && metadata.safeParse(prediction.prediction_metadata).success);
    return attempts.flatMap((attempt) => {
      const action = recoveryActionSchema.safeParse(attempt.action_type);
      const status = z
        .enum(["initiated", "applied", "abandoned"])
        .safeParse(attempt.status);
      if (!action.success || !status.success) return [];
      const source = verifiedPredictions.find((prediction) => prediction.id === attempt.source_prediction_id);
      const paired = verifiedPredictions.find((prediction) => prediction.id === attempt.reassessment_prediction_id);
      const comparison = compareRecoveryPredictions(
        { appliedAt: attempt.applied_at, reassessmentId: attempt.reassessment_prediction_id },
        source && Date.parse(source.created_at) <= Date.parse(attempt.initiated_at) ? source : undefined,
        paired && attempt.evaluated_at && Date.parse(paired.created_at) <= Date.parse(attempt.evaluated_at)
          ? { ...paired, predictedAt: paired.created_at } : null,
      );
      return [
        {
          id: attempt.id,
          action: action.data,
          status: status.data,
          originalDueAt: attempt.original_due_at,
          initiatedAt: attempt.initiated_at,
          appliedAt: attempt.applied_at,
          evaluated: !!attempt.reassessment_prediction_id,
          tracking: attempt.receipt_recorded_at ? "recorded" : attempt.receipt_required ? "awaitingAction" : "unverified",
          comparison,
        },
      ];
    });
  } catch {
    return null;
  }
}
