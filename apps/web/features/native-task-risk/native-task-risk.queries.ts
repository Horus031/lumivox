import { requireUser } from "@/lib/auth/require-user";
import type {
  NativeTaskRiskAssessmentWithTask,
} from "@/features/native-task-risk/native-task-risk.types";

export async function getLatestNativeTaskRiskAssessments(
  maxUniqueTasks = 5
): Promise<NativeTaskRiskAssessmentWithTask[]> {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("native_task_risk_assessments")
    .select(
      `
      *,
      tasks (
        id,
        title,
        due_at,
        priority,
        status
      )
    `
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(
      `Failed to fetch native task risk assessments: ${error.message}`
    );
  }

  const latestByTask = new Map<
    string,
    NativeTaskRiskAssessmentWithTask
  >();

  for (const item of data ?? []) {
    const typedItem =
      item as NativeTaskRiskAssessmentWithTask;

    if (!latestByTask.has(typedItem.task_id)) {
      latestByTask.set(typedItem.task_id, typedItem);
    }
  }

  return Array.from(latestByTask.values())
    .sort((a, b) => Number(b.risk_score) - Number(a.risk_score))
    .slice(0, maxUniqueTasks);
}