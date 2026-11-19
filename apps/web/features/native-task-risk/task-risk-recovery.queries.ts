import type { TypedSupabaseClient } from "@/types/supabase.types";
import { resolveTaskRiskSnapshot } from "./task-risk-snapshot.adapter";

export async function readRecoveryRisk(client: TypedSupabaseClient, taskId: string, now: Date) {
  const [tasks, predictions] = await Promise.all([
    client.from("tasks").select("id,status,completed_at,due_at,due_date").eq("id", taskId).maybeSingle(),
    client.rpc("get_my_native_task_risk_snapshots_for_tasks", { p_task_ids: [taskId] }),
  ]);
  if (tasks.error || predictions.error || !tasks.data) return { status: "unavailable" } as const;
  return resolveTaskRiskSnapshot(tasks.data, predictions.data?.[0], now);
}
