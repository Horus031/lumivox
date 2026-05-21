"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";

type DeadlineRiskPredictionApiResponse = {
  prediction_id: string | null;
  model_key: string;
  model_version: string;
  risk_probability: number;
  predicted_label: boolean;
  decision_threshold: number;
};

type GeminiInsightApiResponse = {
  insight_id: string | null;
  prediction_id: string;
  llm_model: string;
  prompt_version: string;
};

const DEMO_HIGH_RISK_FEATURES = {
  assessment_weight: 3,
  engagement_events_total: 1102,
  active_days_total: 86,
  engagement_events_last_7d: 5,
  active_days_last_7d: 2,
  prior_deadline_items_count: 10,
  prior_submissions_count: 10,
  prior_late_submissions_count: 5,
  prior_submission_rate: 1,
  prior_late_rate: 0.5,
};

export async function generateDemoAiInsightAction(): Promise<
  ActionResult<{
    predictionId: string;
    insightId: string | null;
  }>
> {
  try {
    const { user } = await requireUser();

    const apiBaseUrl = process.env.AI_API_BASE_URL;
    const internalKey = process.env.AI_INTERNAL_API_KEY;

    if (!apiBaseUrl || !internalKey) {
      return {
        success: false,
        message:
          "AI backend environment variables are not configured correctly.",
      };
    }

    // --------------------------------------------------------
    // 1. Generate Deadline Risk Prediction
    // --------------------------------------------------------

    const predictionResponse = await fetch(
      `${apiBaseUrl}/api/v1/ml/deadline-risk/predict`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-lumivox-internal-key": internalKey,
        },
        body: JSON.stringify({
          user_id: user.id,
          task_id: null,
          input_mode: "oulad_compatible_features",
          persist_prediction: true,
          features: DEMO_HIGH_RISK_FEATURES,
        }),
        cache: "no-store",
      }
    );

    if (!predictionResponse.ok) {
      const errorBody = await predictionResponse.text();

      return {
        success: false,
        message: `Prediction generation failed: ${errorBody}`,
      };
    }

    const predictionData =
      (await predictionResponse.json()) as DeadlineRiskPredictionApiResponse;

    if (!predictionData.prediction_id) {
      return {
        success: false,
        message: "Prediction was created without a prediction ID.",
      };
    }

    // --------------------------------------------------------
    // 2. Generate Gemini Insight from prediction + SHAP
    // --------------------------------------------------------

    const insightResponse = await fetch(
      `${apiBaseUrl}/api/v1/ai/deadline-risk-insight/generate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-lumivox-internal-key": internalKey,
        },
        body: JSON.stringify({
          prediction_id: predictionData.prediction_id,
          persist_insight: true,
        }),
        cache: "no-store",
      }
    );

    if (!insightResponse.ok) {
      const errorBody = await insightResponse.text();

      return {
        success: false,
        message: `Gemini insight generation failed: ${errorBody}`,
      };
    }

    const insightData =
      (await insightResponse.json()) as GeminiInsightApiResponse;

    revalidatePath("/dashboard");

    return {
      success: true,
      message: "AI demo insight generated successfully.",
      data: {
        predictionId: predictionData.prediction_id,
        insightId: insightData.insight_id,
      },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while generating AI insight.",
    };
  }
}