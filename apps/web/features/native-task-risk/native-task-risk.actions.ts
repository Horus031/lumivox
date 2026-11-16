"use server";

import { fetchAiApi } from "@/lib/ai-api/fetch-ai-api";
import { requireUser } from "@/lib/auth/require-user";
import { getMyNativeTaskRiskCandidateTasks } from "@/features/native-task-risk/native-task-risk.queries";
import type { NativeTaskRiskBatchApiResponse } from "@/features/native-task-risk/native-task-risk.types";

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
