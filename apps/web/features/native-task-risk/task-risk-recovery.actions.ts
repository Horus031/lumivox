"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { fetchAiApi } from "@/lib/ai-api/fetch-ai-api";
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
      "start_verified_task_risk_recovery",
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

export async function reassessTaskRiskAfterRecoveryAction(attemptId: string) {
  if (!z.uuid().safeParse(attemptId).success) return false;
  try {
    const { user, supabase } = await requireUser();
    const { data: attempt } = await supabase
      .from("task_risk_recovery_attempts")
      .select("task_id,applied_at")
      .eq("id", attemptId)
      .eq("status", "applied")
      .maybeSingle();
    if (!attempt?.applied_at) return false;
    const { data: task } = await supabase
      .from("tasks")
      .select("status,completed_at,due_at,due_date")
      .eq("id", attempt.task_id)
      .maybeSingle();
    const now = new Date();
    if (!task || !isTaskRiskEligible(task, now)) return false;

    const writer = recoveryWriter();
    const requestedAt = now.toISOString();
    const { data: reservation } = await writer
      .from("task_risk_recovery_attempts")
      .update({ reassessment_requested_at: requestedAt })
      .eq("id", attemptId)
      .eq("user_id", user.id)
      .eq("status", "applied")
      .or(
        `reassessment_requested_at.is.null,reassessment_requested_at.lt.${new Date(now.getTime() - 120_000).toISOString()}`,
      )
      .select("id")
      .maybeSingle();
    if (!reservation) return false;

    const result = await fetchAiApi<NativeTaskRiskBatchApiResponse>({
      path: "/api/v1/native-task-risk/batch-predict",
      body: { user_id: user.id, task_ids: [attempt.task_id], persist: true },
      retries: 0,
    });
    if (result.predictions.length !== 1 || result.errors.length) return false;
    const [prediction] = result.predictions;
    if (
      prediction.task_id !== attempt.task_id ||
      prediction.prediction_mode !== "native_ml" ||
      !prediction.prediction_id
    )
      return false;
    const risk = await readRecoveryRisk(supabase, attempt.task_id, new Date());
    if (
      risk.status !== "ready" ||
      risk.alert.prediction_id !== prediction.prediction_id ||
      Date.parse(risk.alert.predicted_at) <= Date.parse(attempt.applied_at)
    )
      return false;
    const { data } = await writer
      .from("task_risk_recovery_attempts")
      .update({
        reassessment_prediction_id: risk.alert.prediction_id,
        evaluated_at: new Date().toISOString(),
      })
      .eq("id", attemptId)
      .eq("user_id", user.id)
      .eq("reassessment_requested_at", requestedAt)
      .select("id")
      .maybeSingle();
    return !!data;
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
        "id,action_type,status,original_due_at,initiated_at,applied_at,source_prediction_id,reassessment_prediction_id",
      )
      .eq("task_id", taskId)
      .order("initiated_at", { ascending: false })
      .limit(10);
    if (error) return null;
    if (!attempts?.length) return [];
    const current = await readRecoveryRisk(supabase, taskId, new Date());
    const ids = attempts.map((attempt) => attempt.source_prediction_id);
    const { data: sources } = await supabase
      .from("deadline_risk_predictions")
      .select("id,risk_probability,model_version_id")
      .eq("task_id", taskId)
      .eq("user_id", user.id)
      .in("id", ids);
    const { data: after } =
      current.status === "ready"
        ? await supabase
            .from("deadline_risk_predictions")
            .select("model_version_id")
            .eq("id", current.alert.prediction_id)
            .eq("user_id", user.id)
            .eq("task_id", taskId)
            .maybeSingle()
        : { data: null };
    return attempts.flatMap((attempt) => {
      const action = recoveryActionSchema.safeParse(attempt.action_type);
      const status = z
        .enum(["initiated", "applied", "abandoned"])
        .safeParse(attempt.status);
      if (!action.success || !status.success) return [];
      const source = sources?.find(
        (prediction) => prediction.id === attempt.source_prediction_id,
      );
      const comparison = compareRecoveryPredictions(
        {
          appliedAt: attempt.applied_at,
          reassessmentId: attempt.reassessment_prediction_id,
        },
        source,
        current.status === "ready" && after
          ? {
              id: current.alert.prediction_id,
              predictedAt: current.alert.predicted_at,
              risk_probability: current.alert.risk_probability,
              model_version_id: after.model_version_id,
            }
          : null,
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
          comparison,
        },
      ];
    });
  } catch {
    return null;
  }
}
