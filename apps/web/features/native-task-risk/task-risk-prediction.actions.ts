"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { fetchAiApi } from "@/lib/ai-api/fetch-ai-api";
import { checkRateLimit } from "@/lib/redis/rate-limit";
import { isTaskRiskEligible } from "./task-risk-snapshot.adapter";
import { readRecoveryRisk } from "./task-risk-recovery.queries";
import type { TaskRiskViewState } from "./task-risk-presentation.types";
import type { NativeTaskRiskBatchApiResponse } from "./native-task-risk.types";

export type TaskRiskPredictionResult =
  | { success: true; state: Extract<TaskRiskViewState, { status: "ready" }> }
  | { success: false; error: "unavailable" | "ineligible" | "limited" };

export async function predictTaskRiskAction(taskId: string): Promise<TaskRiskPredictionResult> {
  if (!z.uuid().safeParse(taskId).success) return { success: false, error: "unavailable" };

  try {
    const { user, supabase } = await requireUser();
    const { data: task, error } = await supabase.from("tasks")
      .select("status,completed_at,due_at,due_date")
      .eq("id", taskId).eq("user_id", user.id).maybeSingle();
    if (error || !task) return { success: false, error: "unavailable" };
    if (!isTaskRiskEligible(task, new Date())) return { success: false, error: "ineligible" };

    // Also recovers a committed prediction whose HTTP response was lost.
    const existing = await readRecoveryRisk(supabase, taskId, new Date());
    if (existing.status === "ready") return { success: true, state: existing };

    const quota = await checkRateLimit({
      key: `task-risk-prediction:${user.id}`, limit: 10, window: "1 h", mode: "fail-closed",
    });
    if (!quota.success) return { success: false, error: "limited" };

    try {
      await fetchAiApi<NativeTaskRiskBatchApiResponse>({
        path: "/api/v1/native-task-risk/batch-predict",
        body: { user_id: user.id, task_ids: [taskId], persist: true },
        retries: 0,
      });
    } catch {
      // Check persisted data even if the transport timed out after commit.
    }

    // Resolve through the same RLS, revision, model and freshness checks as the tab.
    const state = await readRecoveryRisk(supabase, taskId, new Date());
    return state.status === "ready"
      ? { success: true, state }
      : { success: false, error: "unavailable" };
  } catch {
    return { success: false, error: "unavailable" };
  }
}
