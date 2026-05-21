import { requireUser } from "@/lib/auth/require-user";
import type {
  NativeTaskAiInsightCardWithAssessment,
} from "@/features/native-task-insights/native-task-insight.types";

export async function getLatestNativeTaskAiInsights(
  limit = 3
): Promise<NativeTaskAiInsightCardWithAssessment[]> {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("ai_insight_cards")
    .select(
      `
      *,
      native_task_risk_assessments (
        id,
        risk_score,
        risk_band,
        created_at,
        tasks (
          id,
          title,
          due_at,
          priority,
          status
        )
      )
    `
    )
    .eq("insight_type", "native_task_risk")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(
      `Failed to fetch native task AI insights: ${error.message}`
    );
  }

  return (data ?? []) as NativeTaskAiInsightCardWithAssessment[];
}