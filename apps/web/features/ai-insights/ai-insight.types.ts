import type { Database } from "@/types/database.types";

export type AiInsightCard =
  Database["public"]["Tables"]["ai_insight_cards"]["Row"];

export type DeadlineRiskPredictionSummary = {
  id: string;
  risk_probability: number;
  predicted_label: boolean;
  decision_threshold: number;
  input_mode:
    | Database["public"]["Enums"]["deadline_risk_input_mode"];
  created_at: string;
};

export type AiInsightEvidenceItem = {
  feature: string;
  direction: "increases_risk" | "decreases_risk";
  student_friendly_explanation: string;
};

export type AiInsightRecommendedAction = {
  action: string;
  rationale: string;
};

export type AiInsightCardWithPrediction = AiInsightCard & {
  deadline_risk_predictions: DeadlineRiskPredictionSummary | null;
};