"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/features/admin/admin-auth";
import type { ActionResult } from "@/lib/actions/action-result";

const deleteTranslationSchema = z.object({
  translationId: z.string().uuid(),
});

const clearEntityTranslationsSchema = z.object({
  entityType: z.string().min(1).max(80),
  entityId: z.string().uuid(),
});

export async function adminDeleteAiContentTranslationAction(
  input: z.infer<typeof deleteTranslationSchema>
): Promise<ActionResult> {
  try {
    const { supabase } = await requireAdmin();

    const parsed = deleteTranslationSchema.safeParse(input);

    if (!parsed.success) {
      return {
        success: false,
        message: "Invalid translation id.",
      };
    }

    const { error } = await supabase.rpc(
      "admin_delete_ai_content_translation",
      {
        p_translation_id: parsed.data.translationId,
      }
    );

    if (error) {
      return {
        success: false,
        message: `Failed to delete translation cache: ${error.message}`,
      };
    }

    revalidatePath("/admin/ai");
    revalidatePath("/admin/ai/translations");

    return {
      success: true,
      message: "Translation cache deleted.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while deleting translation cache.",
    };
  }
}

export async function adminClearAiEntityTranslationsAction(
  input: z.infer<typeof clearEntityTranslationsSchema>
): Promise<ActionResult<{ deletedCount: number }>> {
  try {
    const { supabase } = await requireAdmin();

    const parsed = clearEntityTranslationsSchema.safeParse(input);

    if (!parsed.success) {
      return {
        success: false,
        message: "Invalid entity translation input.",
      };
    }

    const { data, error } = await supabase.rpc(
      "admin_clear_ai_entity_translations",
      {
        p_entity_type: parsed.data.entityType,
        p_entity_id: parsed.data.entityId,
      }
    );

    if (error) {
      return {
        success: false,
        message: `Failed to clear entity translations: ${error.message}`,
      };
    }

    revalidatePath("/admin/ai");
    revalidatePath("/admin/ai/translations");

    return {
      success: true,
      message: `Cleared ${data ?? 0} cached translation(s).`,
      data: {
        deletedCount: data ?? 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while clearing entity translations.",
    };
  }
}