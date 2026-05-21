from __future__ import annotations

import json
from uuid import UUID

from app.clients.gemini_client import get_gemini_client
from app.clients.supabase_client import get_supabase_client
from app.core.config import settings
from app.schemas.native_task_risk_insight import (
    GenerateNativeTaskRiskInsightRequest,
    GenerateNativeTaskRiskInsightResponse,
    GeminiNativeTaskRiskInsightOutput,
)


PROMPT_VERSION = "native-task-risk-insight-v1"


def _fetch_native_task_risk_context(
    assessment_id: UUID,
) -> dict:
    supabase = get_supabase_client()

    assessment_result = (
        supabase.table("native_task_risk_assessments")
        .select(
            """
            id,
            user_id,
            task_id,
            risk_score,
            risk_band,
            deadline_pressure_score,
            priority_pressure_score,
            focus_neglect_score,
            deadline_reliability_risk_score,
            workload_pressure_score,
            component_payload,
            evidence_payload,
            horizon_days,
            focus_window_days,
            history_window_days,
            calculation_version,
            created_at,
            tasks (
                id,
                title,
                description,
                priority,
                status,
                due_at,
                estimated_minutes
            )
            """
        )
        .eq("id", str(assessment_id))
        .maybe_single()
        .execute()
    )

    assessment = assessment_result.data if assessment_result else None

    if not assessment:
        raise ValueError("Native task risk assessment not found.")

    if not assessment.get("tasks"):
        raise ValueError("Task context not found for this assessment.")

    return assessment


def _build_prompt(context: dict) -> str:
    task = context["tasks"]

    prompt_payload = {
        "task": {
            "title": task["title"],
            "priority": task["priority"],
            "status": task["status"],
            "due_at": task["due_at"],
            "estimated_minutes": task["estimated_minutes"],
        },
        "native_task_risk_assessment": {
            "risk_score": context["risk_score"],
            "risk_band": context["risk_band"],
            "component_scores": {
                "deadline_pressure_score": context[
                    "deadline_pressure_score"
                ],
                "priority_pressure_score": context[
                    "priority_pressure_score"
                ],
                "focus_neglect_score": context[
                    "focus_neglect_score"
                ],
                "deadline_reliability_risk_score": context[
                    "deadline_reliability_risk_score"
                ],
                "workload_pressure_score": context[
                    "workload_pressure_score"
                ],
            },
            "evidence_payload": context["evidence_payload"],
            "calculation_version": context["calculation_version"],
        },
    }

    return f"""
You are the natural-language explanation layer of Lumivox, an AI-powered learning behaviour analytics platform.

Your task is to produce a concise, student-facing insight card based ONLY on:
1. The native Lumivox task risk assessment.
2. The evidence payload supplied below.

Important rules:
- Do NOT invent causes, signals, or evidence that are not present in the provided payload.
- Do NOT claim certainty. This is a structured risk assessment, not a guaranteed outcome.
- Do NOT say the student will definitely fail, miss the deadline, or be unsuccessful.
- Use constructive, encouraging language.
- The "evidence" array must only reference evidence keys present in evidence_payload.
- Recommended actions should logically follow from the evidence and remain concrete, achievable study/productivity actions.
- Do not mention internal implementation details such as heuristic scoring formulas, database tables, or API systems.

Structured context:
{json.dumps(prompt_payload, ensure_ascii=False, indent=2)}
""".strip()


def _generate_structured_insight(
    prompt: str,
) -> GeminiNativeTaskRiskInsightOutput:
    client = get_gemini_client()

    response = client.models.generate_content(
        model=settings.gemini_insight_model,
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "response_json_schema": (
                GeminiNativeTaskRiskInsightOutput
                .model_json_schema()
            ),
        },
    )

    return GeminiNativeTaskRiskInsightOutput.model_validate_json(
        response.text
    )


def _persist_native_task_risk_insight(
    *,
    assessment_id: UUID,
    user_id: str,
    insight: GeminiNativeTaskRiskInsightOutput,
) -> UUID:
    supabase = get_supabase_client()

    insert_result = (
        supabase.table("ai_insight_cards")
        .upsert(
            {
                "user_id": user_id,
                "insight_type": "native_task_risk",
                "deadline_risk_prediction_id": None,
                "native_task_risk_assessment_id": str(assessment_id),
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
                    "source": "FastAPI Gemini Native Task Risk Insight Generator",
                },
            },
            on_conflict="native_task_risk_assessment_id",
        )
        .execute()
    )

    insight_id = insert_result.data[0]["id"]

    return UUID(insight_id)


def generate_native_task_risk_insight(
    payload: GenerateNativeTaskRiskInsightRequest,
) -> GenerateNativeTaskRiskInsightResponse:
    context = _fetch_native_task_risk_context(payload.assessment_id)

    prompt = _build_prompt(context)

    insight = _generate_structured_insight(prompt)

    insight_id = None

    if payload.persist_insight:
        insight_id = _persist_native_task_risk_insight(
            assessment_id=payload.assessment_id,
            user_id=context["user_id"],
            insight=insight,
        )

    return GenerateNativeTaskRiskInsightResponse(
        insight_id=insight_id,
        assessment_id=payload.assessment_id,
        llm_model=settings.gemini_insight_model,
        prompt_version=PROMPT_VERSION,
        insight=insight,
    )