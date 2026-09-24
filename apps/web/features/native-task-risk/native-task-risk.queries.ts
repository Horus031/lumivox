import { requireUser } from "@/lib/auth/require-user";
import type {
  NativeTaskRiskAlert,
  NativeTaskRiskCandidateTask,
} from "@/features/native-task-risk/native-task-risk.types";
import type { TypedSupabaseClient } from "@/types/supabase.types";

export async function getMyNativeTaskRiskAlerts(
  limit = 8,
  supabase?: TypedSupabaseClient,
) {
  const client = supabase ?? (await requireUser()).supabase;

  const { data, error } = await client.rpc(
    "get_my_latest_native_task_risk_alerts",
    {
      p_limit: limit,
    },
  );

  if (error) {
    throw new Error(`Failed to load native task risk alerts: ${error.message}`);
  }

  return (data ?? []) as NativeTaskRiskAlert[];
}

export async function getMyNativeTaskRiskCandidateTasks({
  horizonDays = 14,
  limit = 8,
}: {
  horizonDays?: number;
  limit?: number;
}) {
  const { supabase } = await requireUser();

  const { data, error } = await supabase.rpc(
    "get_my_native_task_risk_candidate_tasks",
    {
      p_horizon_days: horizonDays,
      p_limit: limit,
    },
  );

  if (error) {
    throw new Error(
      `Failed to load native task risk candidates: ${error.message}`,
    );
  }

  return (data ?? []) as NativeTaskRiskCandidateTask[];
}
