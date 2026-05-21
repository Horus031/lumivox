import type { Database } from "@/types/database.types";

export type NativeTaskRiskAssessment =
  Database["public"]["Tables"]["native_task_risk_assessments"]["Row"];

export type NativeTaskRiskEvidenceItem = {
  key: string;
  title: string;
  message: string;
  severity: "neutral" | "watch" | "important";
};

export type NativeTaskRiskTaskSummary = {
  id: string;
  title: string;
  due_at: string | null;
  priority: Database["public"]["Enums"]["task_priority"];
  status: Database["public"]["Enums"]["task_status"];
};

export type NativeTaskRiskAssessmentWithTask =
  NativeTaskRiskAssessment & {
    tasks: NativeTaskRiskTaskSummary | null;
  };