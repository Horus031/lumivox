"use server";

import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/require-user";
import { scheduleEngagementRecalculation } from "@/features/engagement-retention/engagement-retention.background";
import { TASK_STATUS_VALUES } from "@/features/tasks/task-status";
import type { ActionResult } from "@/lib/actions/action-result";

const metadataSchema = z.object({
  taskId: z.uuid(),
  expectedStatus: z.enum(TASK_STATUS_VALUES),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  change: z.discriminatedUnion("field", [
    z.object({ field: z.literal("priority"), value: z.enum(["low", "medium", "high", "critical"]) }),
    z.object({ field: z.literal("deadline"), value: z.iso.datetime({ offset: true }).nullable() }),
  ]),
});

export async function updateWorkspaceTaskMetadata(input: z.input<typeof metadataSchema>): Promise<ActionResult> {
  const [t, board] = await Promise.all([getTranslations("workspace.mvp"), getTranslations("workspace.board")]);
  const parsed = metadataSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: t("saveFailed") };

  try {
    const { supabase, user } = await requireUser();
    const { taskId, expectedStatus, expectedUpdatedAt, change } = parsed.data;
    const patch = change.field === "priority" ? { priority: change.value } : { due_at: change.value };
    const { data, error } = await supabase.from("tasks").update(patch)
      .eq("id", taskId)
      .eq("user_id", user.id)
      .is("parent_task_id", null)
      .eq("status", expectedStatus)
      .eq("updated_at", expectedUpdatedAt)
      .select("id")
      .maybeSingle();

    if (error) return { success: false, message: t("saveFailed") };
    if (!data) return { success: false, message: board("staleTask") };
    if (expectedStatus === "completed") {
      scheduleEngagementRecalculation({ userId: user.id, source: "task-update" });
    }
    return { success: true, message: t("saved"), data: null };
  } catch {
    return { success: false, message: t("saveFailed") };
  }
}
