"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fetchAiApi } from "@/lib/ai-api/fetch-ai-api";
import { requireUser } from "@/lib/auth/require-user";

type ActionResult<T = null> =
  | { success: true; message: string; data: T }
  | { success: false; message: string };

type SupabaseServerClient = Awaited<ReturnType<typeof requireUser>>["supabase"];

const weekdaySchema = z.enum([
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
]);

const roadmapLevelSchema = z.enum([
  "beginner",
  "intermediate",
  "advanced",
  "custom",
]);

const supportedLocaleSchema = z.enum(["en", "vi"]);

const generateRoadmapSchema = z
  .object({
    topic: z.string().trim().min(2).max(160),
    subjectName: z.string().trim().max(160).optional(),
    description: z.string().trim().max(2000).optional(),

    currentLevel: roadmapLevelSchema,
    targetLevel: roadmapLevelSchema,
    customCurrentLevel: z.string().trim().max(240).optional(),
    customTargetLevel: z.string().trim().max(240).optional(),

    startDate: z.string().min(1),
    endDate: z.string().min(1),

    studyDaysPerWeek: z.coerce.number().int().min(1).max(7),
    availableWeekdays: z.array(weekdaySchema).default([]),
    minutesPerStudyDay: z.coerce.number().int().min(10).max(480),

    preferredLocale: supportedLocaleSchema,
  })
  .superRefine((value, context) => {
    const start = new Date(value.startDate);
    const end = new Date(value.endDate);

    if (Number.isNaN(start.getTime())) {
      context.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "Invalid start date.",
      });
    }

    if (Number.isNaN(end.getTime())) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Invalid end date.",
      });
    }

    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      if (end < start) {
        context.addIssue({
          code: "custom",
          path: ["endDate"],
          message: "End date must be after start date.",
        });
      }
    }

    if (value.currentLevel === "custom" && !value.customCurrentLevel?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["customCurrentLevel"],
        message: "Custom current level is required.",
      });
    }

    if (value.targetLevel === "custom" && !value.customTargetLevel?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["customTargetLevel"],
        message: "Custom target level is required.",
      });
    }
  });

type GenerateRoadmapResponse = {
  roadmap_id: string;
  title: string;
  description: string | null;
  provider?: string | null;
  model_name?: string | null;
  latency_ms?: number | null;
};

export async function generateLearningRoadmapAction(
  input: z.infer<typeof generateRoadmapSchema>
): Promise<ActionResult<{ roadmapId: string }>> {
  try {
    const { user } = await requireUser();

    const parsed = generateRoadmapSchema.safeParse(input);

    if (!parsed.success) {
      return {
        success: false,
        message: parsed.error.issues[0]?.message ?? "Invalid roadmap input.",
      };
    }

    const value = parsed.data;

    const response = await fetchAiApi<GenerateRoadmapResponse>({
      path: "/api/v1/learning-roadmaps/generate",
      body: {
        user_id: user.id,

        topic: value.topic,
        subject_name: value.subjectName || null,
        description: value.description || null,

        current_level: value.currentLevel,
        target_level: value.targetLevel,
        custom_current_level: value.customCurrentLevel || null,
        custom_target_level: value.customTargetLevel || null,

        start_date: value.startDate,
        end_date: value.endDate,

        study_days_per_week: value.studyDaysPerWeek,
        available_weekdays: value.availableWeekdays,
        minutes_per_study_day: value.minutesPerStudyDay,

        preferred_locale: value.preferredLocale,
      },
    });

    revalidatePath("/roadmaps");

    return {
      success: true,
      message: "Roadmap generated successfully.",
      data: {
        roadmapId: response.roadmap_id,
      },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while generating roadmap.",
    };
  }
}

const roadmapNodeTypeSchema = z.enum(["goal", "task", "subtask"]);

const roadmapEditorNodeSchema = z.object({
  id: z.string().uuid(),
  parentNodeId: z.string().uuid().nullable(),
  nodeType: roadmapNodeTypeSchema,
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(1000).nullable().optional(),
  estimatedHours: z.coerce.number().positive().max(500),
  suggestedStartDate: z.string().nullable().optional(),
  suggestedEndDate: z.string().nullable().optional(),
  priority: z.coerce.number().int().min(1).max(5),
  sortOrder: z.coerce.number().int().min(0),
  positionX: z.coerce.number(),
  positionY: z.coerce.number(),
});

const saveRoadmapEditorStateSchema = z.object({
  roadmapId: z.string().uuid(),
  nodes: z.array(roadmapEditorNodeSchema).min(1).max(160),
});

const deleteRoadmapNodeSchema = z.object({
  roadmapId: z.string().uuid(),
  nodeId: z.string().uuid(),
});

function isValidRoadmapConnection(
  parentType: "goal" | "task" | "subtask",
  childType: "goal" | "task" | "subtask"
) {
  return (
    (parentType === "goal" && childType === "task") ||
    (parentType === "task" && childType === "subtask")
  );
}

function validateEditorTree(
  nodes: z.infer<typeof roadmapEditorNodeSchema>[]
): string | null {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  for (const node of nodes) {
    if (node.nodeType === "goal" && node.parentNodeId !== null) {
      return "Goal nodes cannot have a parent.";
    }

    if (node.nodeType !== "goal" && node.parentNodeId === null) {
      return "Task and subtask nodes must have a parent.";
    }

    if (node.parentNodeId) {
      const parent = nodeById.get(node.parentNodeId);

      if (!parent) {
        return `Parent node not found for "${node.title}".`;
      }

      if (!isValidRoadmapConnection(parent.nodeType, node.nodeType)) {
        return `Invalid connection: ${parent.nodeType} cannot connect to ${node.nodeType}.`;
      }
    }
  }

  return null;
}

async function ensureDraftRoadmap({
  roadmapId,
  userId,
  supabase,
}: {
  roadmapId: string;
  userId: string;
  supabase: SupabaseServerClient;
}) {
  const { data, error } = await supabase
    .from("learning_roadmaps")
    .select("id,status")
    .eq("id", roadmapId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to verify roadmap: ${error.message}`);
  }

  if (!data) {
    throw new Error("Roadmap not found.");
  }

  if (data.status !== "draft") {
    throw new Error("Only draft roadmaps can be edited.");
  }
}

export async function saveRoadmapEditorStateAction(
  input: z.infer<typeof saveRoadmapEditorStateSchema>
): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();

    const parsed = saveRoadmapEditorStateSchema.safeParse(input);

    if (!parsed.success) {
      return {
        success: false,
        message: parsed.error.issues[0]?.message ?? "Invalid roadmap editor state.",
      };
    }

    const validationError = validateEditorTree(parsed.data.nodes);

    if (validationError) {
      return {
        success: false,
        message: validationError,
      };
    }

    await ensureDraftRoadmap({
      roadmapId: parsed.data.roadmapId,
      userId: user.id,
      supabase,
    });

    const rows = parsed.data.nodes.map((node) => ({
      id: node.id,
      roadmap_id: parsed.data.roadmapId,
      user_id: user.id,
      parent_node_id: node.parentNodeId,
      node_type: node.nodeType,
      title: node.title,
      description: node.description || null,
      estimated_hours: node.estimatedHours,
      suggested_start_date: node.suggestedStartDate || null,
      suggested_end_date: node.suggestedEndDate || null,
      priority: node.priority,
      sort_order: node.sortOrder,
      position_x: node.positionX,
      position_y: node.positionY,
    }));

    const { error } = await supabase
      .from("learning_roadmap_nodes")
      .upsert(rows, {
        onConflict: "id",
      });

    if (error) {
      return {
        success: false,
        message: `Failed to save roadmap editor state: ${error.message}`,
      };
    }

    revalidatePath("/roadmaps");
    revalidatePath(`/roadmaps/${parsed.data.roadmapId}`);
    revalidatePath(`/roadmaps/${parsed.data.roadmapId}/edit`);

    return {
      success: true,
      message: "Roadmap changes saved.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while saving roadmap editor state.",
    };
  }
}

export async function deleteRoadmapNodeAction(
  input: z.infer<typeof deleteRoadmapNodeSchema>
): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();

    const parsed = deleteRoadmapNodeSchema.safeParse(input);

    if (!parsed.success) {
      return {
        success: false,
        message: "Invalid roadmap node.",
      };
    }

    await ensureDraftRoadmap({
      roadmapId: parsed.data.roadmapId,
      userId: user.id,
      supabase,
    });

    const { error } = await supabase
      .from("learning_roadmap_nodes")
      .delete()
      .eq("id", parsed.data.nodeId)
      .eq("roadmap_id", parsed.data.roadmapId)
      .eq("user_id", user.id);

    if (error) {
      return {
        success: false,
        message: `Failed to delete roadmap node: ${error.message}`,
      };
    }

    revalidatePath("/roadmaps");
    revalidatePath(`/roadmaps/${parsed.data.roadmapId}`);
    revalidatePath(`/roadmaps/${parsed.data.roadmapId}/edit`);

    return {
      success: true,
      message: "Roadmap node deleted.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while deleting roadmap node.",
    };
  }
}
