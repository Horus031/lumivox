"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/features/admin/admin-auth";
import type { ActionResult } from "@/lib/actions/action-result";

const settingKeySchema = z.enum([
  "global_leaderboard_enabled",
  "group_leaderboard_enabled",
  "default_rag_top_k",
  "default_rag_prompt_variant",
  "weekly_challenge_default_focus_minutes",
  "weekly_challenge_default_completed_tasks",
  "maintenance_mode_enabled",
]);

const updateCmsSettingSchema = z.object({
  key: settingKeySchema,
  value: z.union([z.boolean(), z.number(), z.string()]),
});

export async function updateAdminCmsSettingAction(
  input: z.infer<typeof updateCmsSettingSchema>
): Promise<ActionResult> {
  try {
    const { supabase } = await requireAdmin();

    const parsed = updateCmsSettingSchema.safeParse(input);

    if (!parsed.success) {
      return {
        success: false,
        message: "Invalid CMS setting input.",
      };
    }

    const { error } = await supabase.rpc("admin_update_cms_setting", {
      p_key: parsed.data.key,
      p_value: parsed.data.value,
    });

    if (error) {
      return {
        success: false,
        message: `Failed to update CMS setting: ${error.message}`,
      };
    }

    revalidatePath("/admin/settings");
    revalidatePath("/leaderboard");
    revalidatePath("/groups");
    revalidatePath("/focus");

    return {
      success: true,
      message: "CMS setting updated.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while updating CMS setting.",
    };
  }
}