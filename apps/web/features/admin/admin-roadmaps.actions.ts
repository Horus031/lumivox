"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/features/admin/admin-auth";

type ActionResult<T = null> =
  | { success: true; message: string; data: T }
  | { success: false; message: string };

const setRoadmapArchivedSchema = z.object({
  roadmapId: z.string().uuid(),
  archived: z.boolean(),
});

export async function adminSetLearningRoadmapArchivedAction(
  input: z.infer<typeof setRoadmapArchivedSchema>
): Promise<ActionResult> {
  try {
    const { supabase } = await requireAdmin();

    const parsed = setRoadmapArchivedSchema.safeParse(input);

    if (!parsed.success) {
      return {
        success: false,
        message: "Invalid roadmap archive input.",
      };
    }

    const { error } = await supabase.rpc(
      "admin_set_learning_roadmap_archived",
      {
        p_roadmap_id: parsed.data.roadmapId,
        p_archived: parsed.data.archived,
      }
    );

    if (error) {
      return {
        success: false,
        message: `Failed to update roadmap archive status: ${error.message}`,
      };
    }

    revalidatePath("/admin/roadmaps");
    revalidatePath("/roadmaps");

    return {
      success: true,
      message: parsed.data.archived
        ? "Roadmap archived."
        : "Roadmap restored to draft.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while updating roadmap archive status.",
    };
  }
}