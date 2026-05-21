import { requireUser } from "@/lib/auth/require-user";
import type { AiInsightCardWithPrediction } from "./ai-insight.types";

export async function getLatestAiInsightCards(
  limit = 3
): Promise<AiInsightCardWithPrediction[]> {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("ai_insight_cards")
    .select(
      `
      *,
      deadline_risk_predictions (
        id,
        risk_probability,
        predicted_label,
        decision_threshold,
        input_mode,
        created_at
      )
    `
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch AI insight cards: ${error.message}`);
  }

  return (data ?? []) as AiInsightCardWithPrediction[];
}