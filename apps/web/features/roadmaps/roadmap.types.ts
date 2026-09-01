export type RoadmapLevel = "beginner" | "intermediate" | "advanced" | "custom";

export type RoadmapStatus = "draft" | "applied" | "archived";

export type RoadmapNodeType = "goal" | "task" | "subtask";

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type SupportedLocale = "en" | "vi";

export type LearningRoadmap = {
  id: string;
  user_id: string;

  title: string;
  topic: string;
  subject_name: string | null;
  description: string | null;

  current_level: RoadmapLevel;
  target_level: RoadmapLevel;
  custom_current_level: string | null;
  custom_target_level: string | null;

  start_date: string;
  end_date: string;

  study_days_per_week: number;
  available_weekdays: Weekday[];
  minutes_per_study_day: number;

  preferred_locale: SupportedLocale;
  status: RoadmapStatus;

  ai_provider: string | null;
  ai_model: string | null;
  ai_latency_ms: number | null;

  applied_at: string | null;
  archived_at: string | null;

  created_at: string;
  updated_at: string;
};

export type LearningRoadmapNode = {
  id: string;
  roadmap_id: string;
  user_id: string;

  parent_node_id: string | null;
  node_type: RoadmapNodeType;

  title: string;
  description: string | null;

  estimated_hours: number;
  suggested_start_date: string | null;
  suggested_end_date: string | null;

  priority: number;
  sort_order: number;

  position_x: number;
  position_y: number;

  linked_goal_id: string | null;
  linked_task_id: string | null;

  created_at: string;
  updated_at: string;
};

export type RoadmapTreeNode = LearningRoadmapNode & {
  children: RoadmapTreeNode[];
};

export type GenerateRoadmapInput = {
  topic: string;
  subjectName?: string;
  description?: string;

  currentLevel: RoadmapLevel;
  targetLevel: RoadmapLevel;
  customCurrentLevel?: string;
  customTargetLevel?: string;

  startDate: string;
  endDate: string;

  studyDaysPerWeek: number;
  availableWeekdays: Weekday[];
  minutesPerStudyDay: number;

  preferredLocale: SupportedLocale;
};

export type RoadmapEditorNodeInput = {
  id: string;
  parentNodeId: string | null;
  nodeType: RoadmapNodeType;
  title: string;
  description?: string | null;
  estimatedHours: number;
  suggestedStartDate?: string | null;
  suggestedEndDate?: string | null;
  priority: number;
  sortOrder: number;
  positionX: number;
  positionY: number;
};

export type RoadmapEditorSaveInput = {
  roadmapId: string;
  nodes: RoadmapEditorNodeInput[];
};