from __future__ import annotations

import json
from uuid import UUID

from app.clients.gemini_client import get_gemini_client
from app.clients.supabase_client import get_supabase_client
from app.core.config import settings
from app.schemas.deadline_risk_insight import (
    GenerateDeadlineRiskInsightRequest,
    GenerateDeadlineRiskInsightResponse,
    GeminiDeadlineRiskInsightOutput,
)


PROMPT_VERSION = "deadline-risk-insight-v1"


def _fetch_prediction_context(prediction_id: UUID) -> dict:
    supabase = get_supabase_client()

    prediction_result = (
        supabase.table("deadline_risk_predictions")
        .select(
            """
            id,
            user_id,
            risk_probability,
            predicted_label,
            decision_threshold,
            feature_payload,
            created_at,
            ml_model_versions (
                model_key,
                version,
                algorithm
            )
            """
        )
        .eq("id", str(prediction_id))
        .single()
        .execute()
    )

    prediction = prediction_result.data

    explanation_result = (
        supabase.table("deadline_risk_prediction_explanations")
        .select(
            """
            baseline_expected_value,
            top_positive_contributors,
            top_negative_contributors,
            explanation_method,
            explanation_version
            """
        )
        .eq("prediction_id", str(prediction_id))
        .single()
        .execute()
    )

    explanation = explanation_result.data

    if not prediction:
        raise ValueError("Prediction not found.")

    if not explanation:
        raise ValueError("SHAP explanation not found for this prediction.")

    return {
        "prediction": prediction,
        "explanation": explanation,
    }


def _build_prompt(context: dict) -> str:
    prediction = context["prediction"]
    explanation = context["explanation"]

    prompt_payload = {
        "prediction": {
            "risk_probability": prediction["risk_probability"],
            "predicted_label": prediction["predicted_label"],
            "decision_threshold": prediction["decision_threshold"],
            "model_version": prediction["ml_model_versions"]["version"],
        },
        "shap_explanation": {
            "top_positive_contributors": explanation[
                "top_positive_contributors"
            ],
            "top_negative_contributors": explanation[
                "top_negative_contributors"
            ],
        },
    }

    return f"""
You are the natural-language explanation layer of Lumivox, an AI-powered learning behaviour analytics platform.

Your task is to produce a concise, student-facing insight card based ONLY on:
1. The machine learning deadline risk prediction.
2. The SHAP feature attributions supplied below.

Important rules:
- Do NOT invent features, causes, or evidence that are not present in the SHAP payload.
- Do NOT claim certainty. This is a probabilistic risk estimate.
- Do NOT say the student will definitely fail or definitely miss the deadline.
- Use encouraging, constructive language.
- Keep the insight actionable and grounded.
- The "evidence" array must only mention features appearing in the SHAP positive or negative contributors.
- Recommended actions should logically follow from the evidence, but remain general study/productivity actions.
- Do not mention OULAD, Random Forest, SHAP, or internal implementation details to the student.

Structured context:
{json.dumps(prompt_payload, ensure_ascii=False, indent=2)}
""".strip()


def _generate_structured_insight(
    prompt: str,
) -> GeminiDeadlineRiskInsightOutput:
    client = get_gemini_client()

    response = client.models.generate_content(
    model=settings.gemini_insight_model,
    contents=prompt,
    config={
        "response_mime_type": "application/json",
        "response_json_schema": GeminiDeadlineRiskInsightOutput.model_json_schema(),
    },
)

    return GeminiDeadlineRiskInsightOutput.model_validate_json(
        response.text
    )


def _persist_insight_card(
    *,
    prediction_id: UUID,
    user_id: str | None,
    insight: GeminiDeadlineRiskInsightOutput,
) -> UUID:
    supabase = get_supabase_client()

    insert_result = (
        supabase.table("ai_insight_cards")
        .upsert(
            {
                "user_id": user_id,
                "insight_type": "deadline_risk",
                "deadline_risk_prediction_id": str(prediction_id),
                "title": insight.title,
                "summary": insight.summary,
                "risk_interpretation": insight.risk_interpretation,
                "evidence": [
                    item.model_dump()
                    for item in insight.evidence
                ],
                "recommended_actions": [
                    item.model_dump()
                    for item in insight.recommended_actions
                ],
                "confidence_note": insight.confidence_note,
                "llm_provider": "google",
                "llm_model": settings.gemini_insight_model,
                "prompt_version": PROMPT_VERSION,
                "structured_output_schema_version": "v1",
                "generation_metadata": {
                    "source": "FastAPI Gemini Deadline Risk Insight Generator",
                },
            },
            on_conflict="deadline_risk_prediction_id",
        )
        .execute()
    )

    insight_id = insert_result.data[0]["id"]

    return UUID(insight_id)


def generate_deadline_risk_insight(
    payload: GenerateDeadlineRiskInsightRequest,
) -> GenerateDeadlineRiskInsightResponse:
    context = _fetch_prediction_context(payload.prediction_id)

    prediction = context["prediction"]

    prompt = _build_prompt(context)

    insight = _generate_structured_insight(prompt)

    insight_id = None

    if payload.persist_insight:
        insight_id = _persist_insight_card(
            prediction_id=payload.prediction_id,
            user_id=prediction.get("user_id"),
            insight=insight,
        )

    return GenerateDeadlineRiskInsightResponse(
        insight_id=insight_id,
        prediction_id=payload.prediction_id,
        llm_model=settings.gemini_insight_model,
        prompt_version=PROMPT_VERSION,
        insight=insight,
    )