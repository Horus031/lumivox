"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/features/admin/admin-auth";
import type { ActionResult } from "@/lib/actions/action-result";

const deleteGroupMessageSchema = z.object({
  messageId: z.string().uuid(),
  groupId: z.string().uuid(),
});

const setGroupArchivedSchema = z.object({
  groupId: z.string().uuid(),
  archived: z.boolean(),
  adminNote: z.string().max(500).optional(),
});

export async function adminDeleteStudyGroupMessageAction(
  input: z.infer<typeof deleteGroupMessageSchema>,
): Promise<ActionResult> {
  try {
    const { supabase } = await requireAdmin();

    const parsed = deleteGroupMessageSchema.safeParse(input);

    if (!parsed.success) {
      return {
        success: false,
        message: "Invalid delete message input.",
      };
    }

    const { error } = await supabase.rpc("admin_delete_study_group_message", {
      p_message_id: parsed.data.messageId,
    });

    if (error) {
      return {
        success: false,
        message: `Failed to delete message: ${error.message}`,
      };
    }

    revalidatePath("/admin/groups");
    revalidatePath(`/admin/groups/${parsed.data.groupId}`);

    return {
      success: true,
      message: "Message deleted.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while deleting message.",
    };
  }
}

export async function adminSetStudyGroupArchivedAction(
  input: z.infer<typeof setGroupArchivedSchema>,
): Promise<ActionResult> {
  try {
    const { supabase } = await requireAdmin();

    const parsed = setGroupArchivedSchema.safeParse(input);

    if (!parsed.success) {
      return {
        success: false,
        message: "Invalid archive group input.",
      };
    }

    const { error } = await supabase.rpc("admin_set_study_group_archived", {
      p_group_id: parsed.data.groupId,
      p_archived: parsed.data.archived,
      p_admin_note: parsed.data.adminNote ?? "None",
    });

    if (error) {
      return {
        success: false,
        message: `Failed to update group status: ${error.message}`,
      };
    }

    revalidatePath("/admin/groups");
    revalidatePath(`/admin/groups/${parsed.data.groupId}`);

    return {
      success: true,
      message: parsed.data.archived ? "Group archived." : "Group restored.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while updating group status.",
    };
  }
}
