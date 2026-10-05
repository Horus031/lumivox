import type { Database } from "@/types/database.types";
import type { LearningDocumentListItem } from "@/features/learning-documents/learning-document.types";

export type Task = Database["public"]["Tables"]["tasks"]["Row"];

export type TaskWithGoal = Task & {
  goals: {
    id: string;
    title: string;
    goal_type: Database["public"]["Enums"]["goal_type"];
    status: Database["public"]["Enums"]["goal_status"];
  } | null;
};

export type TaskWithSubtasks = TaskWithGoal & {
  subtasks: TaskWithGoal[];
};

export type TaskDetailsData = {
  task: TaskWithGoal;
  subtasks: TaskWithGoal[];
  documents: LearningDocumentListItem[];
};
