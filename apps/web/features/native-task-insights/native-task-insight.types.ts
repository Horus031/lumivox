import type { Database } from "@/types/database.types";

export type NativeTaskAiInsightCard =
  Database["public"]["Tables"]["ai_insight_cards"]["Row"];

export type NativeTaskInsightEvidenceItem = {
  evidence_key: string;
  student_friendly_explanation: string;
};

export type NativeTaskInsightRecommendedAction = {
  action: string;
  rationale: string;
};

export type NativeTaskRiskAssessmentSummary = {
  id: string;
  risk_score: number;
  risk_band:
    | Database["public"]["Enums"]["native_task_risk_band"];
  created_at: string;
  tasks:
    | {
        id: string;
        title: string;
        due_at: string | null;
        priority:
          | Database["public"]["Enums"]["task_priority"];
        status:
          | Database["public"]["Enums"]["task_status"];
      }
    | null;
};

export type NativeTaskAiInsightCardWithAssessment =
  NativeTaskAiInsightCard & {
    native_task_risk_assessments:
      | NativeTaskRiskAssessmentSummary
      | null;
  };