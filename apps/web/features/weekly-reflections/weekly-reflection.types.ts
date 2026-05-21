import type { Database } from "@/types/database.types";

export type WeeklyReflection =
  Database["public"]["Tables"]["weekly_reflections"]["Row"];

export type WeeklyReflectionCard =
  Database["public"]["Tables"]["weekly_reflection_cards"]["Row"];

export type WeeklyReflectionWin = {
  evidence_key: string;
  student_friendly_explanation: string;
};

export type WeeklyReflectionWatchout = {
  evidence_key: string;
  student_friendly_explanation: string;
};

export type WeeklyReflectionAction = {
  action: string;
  rationale: string;
};

export type WeeklyReflectionMetrics = {
  average_standard_pbi: number | null;
  average_personalized_pbi: number | null;
  completed_focus_minutes: number;
  completed_focus_sessions: number;
  active_focus_days: number;
  completed_tasks: number;
  late_or_overdue_tasks: number;
};

export type WeeklyReflectionCardWithReflection =
  WeeklyReflectionCard & {
    weekly_reflections:
      | WeeklyReflection
      | null;
  };