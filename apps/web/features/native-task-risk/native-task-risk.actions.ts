"use server";

import { fetchAiApi } from "@/lib/ai-api/fetch-ai-api";
import { requireUser } from "@/lib/auth/require-user";
import { getMyNativeTaskRiskCandidateTasks } from "@/features/native-task-risk/native-task-risk.queries";
import type { NativeTaskRiskBatchApiResponse } from "@/features/native-task-risk/native-task-risk.types";
import { z } from "zod";

type ActionResult<T = null> =
  | { success: true; message: string; data: T }
  | { success: false; message: string };

export async function refreshNativeTaskRiskPredictionsAction(): Promise<
  ActionResult<{
    predictedCount: number;
    errorCount: number;
  }>
> {
  try {
    const { user } = await requireUser();

    const candidates = await getMyNativeTaskRiskCandidateTasks({
      horizonDays: 14,
      limit: 8,
    });

    if (candidates.length === 0) {
      return {
        success: true,
        message: "No upcoming tasks need risk prediction.",
        data: {
          predictedCount: 0,
          errorCount: 0,
        },
      };
    }

    const response = await fetchAiApi<NativeTaskRiskBatchApiResponse>({
      path: "/api/v1/native-task-risk/batch-predict",
      body: {
        user_id: user.id,
        task_ids: candidates.map((task) => task.task_id),
        persist: true,
      },
    });


    return {
      success: true,
      message: `Updated ${response.predictions.length} task risk prediction(s).`,
      data: {
        predictedCount: response.predictions.length,
        errorCount: response.errors.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while refreshing task risk predictions.",
    };
  }
}


const rescheduleTaskSchema = z.object({
  taskId: z.string().uuid(),
  daysToAdd: z.coerce.number().int().min(1).max(14),
});

export async function rescheduleTaskFromRiskAlertAction(
  input: z.infer<typeof rescheduleTaskSchema>
): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();

    const parsed = rescheduleTaskSchema.safeParse(input);

    if (!parsed.success) {
      return {
        success: false,
        message: "Invalid reschedule input.",
      };
    }

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("id,user_id,due_at,due_date,status,completed_at")
      .eq("id", parsed.data.taskId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (taskError) {
      return {
        success: false,
        message: `Failed to load task: ${taskError.message}`,
      };
    }

    if (!task) {
      return {
        success: false,
        message: "Task not found.",
      };
    }

    if (task.completed_at || task.status === "completed") {
      return {
        success: false,
        message: "Completed tasks cannot be rescheduled from risk alerts.",
      };
    }

    const baseDate = task.due_at
      ? new Date(task.due_at)
      : task.due_date
        ? new Date(`${task.due_date}T23:59:00.000Z`)
        : null;

    if (!baseDate) {
      return {
        success: false,
        message: "Task has no deadline to reschedule.",
      };
    }

    baseDate.setDate(baseDate.getDate() + parsed.data.daysToAdd);

    const dueAt = baseDate.toISOString();
    const dueDate = dueAt.slice(0, 10);

    const { error: updateError } = await supabase
      .from("tasks")
      .update({
        due_at: dueAt,
        due_date: dueDate,
      })
      .eq("id", parsed.data.taskId)
      .eq("user_id", user.id);

    if (updateError) {
      return {
        success: false,
        message: `Failed to reschedule task: ${updateError.message}`,
      };
    }


    return {
      success: true,
      message: `Task deadline moved ${parsed.data.daysToAdd} day(s) later. Refresh risk to recalculate.`,
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while rescheduling task.",
    };
  }
}