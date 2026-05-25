"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";
import { checkRateLimit, formatRateLimitMessage } from "@/lib/redis/rate-limit";

type NativeTaskRiskInsightApiResponse = {
  insight_id: string | null;
  assessment_id: string;
  llm_model: string;
  prompt_version: string;
};

export async function generateNativeTaskRiskInsightAction(
  assessmentId: string,
): Promise<ActionResult<{ insightId: string | null }>> {
  try {
    const { user } = await requireUser();

    const rateLimit = await checkRateLimit({
      key: `native-task-ai-insight:${user.id}`,
      limit: 3,
      window: "10 m",
    });

    if (!rateLimit.success) {
      return {
        success: false,
        message: formatRateLimitMessage(rateLimit.reset),
      };
    }

    const apiBaseUrl = process.env.AI_API_BASE_URL;
    const internalKey = process.env.AI_INTERNAL_API_KEY;

    if (!apiBaseUrl || !internalKey) {
      return {
        success: false,
        message:
          "AI backend environment variables are not configured correctly.",
      };
    }

    const response = await fetch(
      `${apiBaseUrl}/api/v1/ai/native-task-risk-insight/generate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-lumivox-internal-key": internalKey,
        },
        body: JSON.stringify({
          assessment_id: assessmentId,
          persist_insight: true,
        }),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();

      return {
        success: false,
        message: `Native AI insight generation failed: ${errorBody}`,
      };
    }

    const data = (await response.json()) as NativeTaskRiskInsightApiResponse;

    revalidatePath("/dashboard");

    return {
      success: true,
      message: "Native task AI insight generated successfully.",
      data: {
        insightId: data.insight_id,
      },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while generating native task AI insight.",
    };
  }
}
