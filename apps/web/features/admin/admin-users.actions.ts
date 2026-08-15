"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/features/admin/admin-auth";
import type { ActionResult } from "@/lib/actions/action-result";

const updateUserRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["user", "admin"]),
});

const updateLeaderboardVisibilitySchema = z.object({
  userId: z.string().uuid(),
  leaderboardOptIn: z.boolean(),
});

export async function updateAdminUserRoleAction(
  input: z.infer<typeof updateUserRoleSchema>
): Promise<ActionResult> {
  try {
    const { supabase } = await requireAdmin();

    const parsed = updateUserRoleSchema.safeParse(input);

    if (!parsed.success) {
      return {
        success: false,
        message: "Invalid role update input.",
      };
    }

    const { error } = await supabase.rpc("admin_update_user_role", {
      p_user_id: parsed.data.userId,
      p_role: parsed.data.role,
    });

    if (error) {
      return {
        success: false,
        message: `Failed to update user role: ${error.message}`,
      };
    }

    revalidatePath("/admin");
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${parsed.data.userId}`);

    return {
      success: true,
      message: "User role updated.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while updating user role.",
    };
  }
}

export async function updateAdminUserLeaderboardVisibilityAction(
  input: z.infer<typeof updateLeaderboardVisibilitySchema>
): Promise<ActionResult> {
  try {
    const { supabase } = await requireAdmin();

    const parsed = updateLeaderboardVisibilitySchema.safeParse(input);

    if (!parsed.success) {
      return {
        success: false,
        message: "Invalid leaderboard visibility input.",
      };
    }

    const { error } = await supabase.rpc(
      "admin_update_user_leaderboard_visibility",
      {
        p_user_id: parsed.data.userId,
        p_leaderboard_opt_in: parsed.data.leaderboardOptIn,
      }
    );

    if (error) {
      return {
        success: false,
        message: `Failed to update leaderboard visibility: ${error.message}`,
      };
    }

    revalidatePath("/leaderboard");
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${parsed.data.userId}`);

    return {
      success: true,
      message: "Leaderboard visibility updated.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while updating leaderboard visibility.",
    };
  }
}