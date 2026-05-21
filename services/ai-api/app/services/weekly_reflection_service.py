from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from statistics import mean
from uuid import UUID

from app.clients.gemini_client import get_gemini_client
from app.clients.supabase_client import get_supabase_client
from app.core.config import settings
from app.schemas.weekly_reflection import (
    GeminiWeeklyReflectionOutput,
    GenerateWeeklyReflectionRequest,
    GenerateWeeklyReflectionResponse,
    WeeklyReflectionComparisonPayload,
    WeeklyReflectionEvidenceItem,
    WeeklyReflectionMetricPayload,
)


PROMPT_VERSION = "weekly-reflection-v1"


# ============================================================
# 1. General helpers
# ============================================================

def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None

    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def safe_round(value: float | None, digits: int = 2) -> float | None:
    if value is None:
        return None

    return round(float(value), digits)


def pick_numeric(row: dict, candidates: list[str]) -> float | None:
    for key in candidates:
        value = row.get(key)

        if value is not None:
            try:
                return float(value)
            except (TypeError, ValueError):
                continue

    return None


# ============================================================
# 2. Window builders
# ============================================================

def build_reflection_windows() -> dict:
    current_end = datetime.now(timezone.utc)
    current_start = current_end - timedelta(days=7)

    previous_end = current_start
    previous_start = previous_end - timedelta(days=7)

    return {
        "current_start": current_start,
        "current_end": current_end,
        "previous_start": previous_start,
        "previous_end": previous_end,
    }


# ============================================================
# 3. Metrics aggregation
# ============================================================

def aggregate_metrics_for_window(
    *,
    user_id: UUID,
    window_start: datetime,
    window_end: datetime,
) -> WeeklyReflectionMetricPayload:
    supabase = get_supabase_client()

    # --------------------------------------------------------
    # Focus sessions
    # --------------------------------------------------------

    focus_result = (
        supabase.table("focus_sessions")
        .select(
            """
            id,
            ended_at,
            status,
            actual_focus_minutes
            """
        )
        .eq("user_id", str(user_id))
        .eq("status", "completed")
        .gte("ended_at", window_start.isoformat())
        .lt("ended_at", window_end.isoformat())
        .execute()
    )

    focus_sessions = focus_result.data or []

    completed_focus_minutes = 0.0
    active_focus_days: set[str] = set()

    for session in focus_sessions:
        completed_focus_minutes += float(
            session.get("actual_focus_minutes") or 0
        )

        ended_at = parse_dt(session.get("ended_at"))

        if ended_at:
            active_focus_days.add(ended_at.date().isoformat())

    # --------------------------------------------------------
    # Completed tasks
    # --------------------------------------------------------

    completed_tasks_result = (
        supabase.table("tasks")
        .select(
            """
            id,
            status,
            completed_at
            """
        )
        .eq("user_id", str(user_id))
        .eq("status", "completed")
        .gte("completed_at", window_start.isoformat())
        .lt("completed_at", window_end.isoformat())
        .execute()
    )

    completed_tasks_count = len(completed_tasks_result.data or [])

    # --------------------------------------------------------
    # Due tasks that were late or unresolved after deadline
    # --------------------------------------------------------

    due_tasks_result = (
        supabase.table("tasks")
        .select(
            """
            id,
            status,
            due_at,
            completed_at
            """
        )
        .eq("user_id", str(user_id))
        .gte("due_at", window_start.isoformat())
        .lt("due_at", window_end.isoformat())
        .execute()
    )

    due_tasks = due_tasks_result.data or []
    late_or_overdue_tasks = 0

    for task in due_tasks:
        due_at = parse_dt(task.get("due_at"))
        completed_at = parse_dt(task.get("completed_at"))
        status = task.get("status")

        if due_at is None:
            continue

        is_completed_late = (
            status == "completed"
            and completed_at is not None
            and completed_at > due_at
        )

        is_unresolved_after_deadline = (
            status != "completed"
            and due_at < window_end
        )

        if is_completed_late or is_unresolved_after_deadline:
            late_or_overdue_tasks += 1

    # --------------------------------------------------------
    # PBI snapshots
    # Flexible key picking keeps this compatible with your
    # existing table naming.
    # --------------------------------------------------------

    pbi_result = (
        supabase.table("pbi_snapshots")
        .select("*")
        .eq("user_id", str(user_id))
        .gte("created_at", window_start.isoformat())
        .lt("created_at", window_end.isoformat())
        .execute()
    )

    pbi_snapshots = pbi_result.data or []

    standard_values: list[float] = []
    personalized_values: list[float] = []

    for snapshot in pbi_snapshots:
        standard_value = pick_numeric(
            snapshot,
            [
                "standard_pbi_score",
                "standard_pbi",
                "standard_score",
            ],
        )

        personalized_value = pick_numeric(
            snapshot,
            [
                "personalized_pbi_score",
                "personalized_pbi",
                "personalized_score",
            ],
        )

        if standard_value is not None:
            standard_values.append(standard_value)

        if personalized_value is not None:
            personalized_values.append(personalized_value)

    average_standard_pbi = (
        safe_round(mean(standard_values))
        if standard_values
        else None
    )

    average_personalized_pbi = (
        safe_round(mean(personalized_values))
        if personalized_values
        else None
    )

    return WeeklyReflectionMetricPayload(
        average_standard_pbi=average_standard_pbi,
        average_personalized_pbi=average_personalized_pbi,
        completed_focus_minutes=round(completed_focus_minutes, 2),
        completed_focus_sessions=len(focus_sessions),
        active_focus_days=len(active_focus_days),
        completed_tasks=completed_tasks_count,
        late_or_overdue_tasks=late_or_overdue_tasks,
    )


# ============================================================
# 4. Comparison
# ============================================================

def compare_metrics(
    current: WeeklyReflectionMetricPayload,
    previous: WeeklyReflectionMetricPayload,
) -> WeeklyReflectionComparisonPayload:
    def nullable_delta(a: float | None, b: float | None) -> float | None:
        if a is None or b is None:
            return None

        return round(a - b, 2)

    return WeeklyReflectionComparisonPayload(
        average_standard_pbi_delta=nullable_delta(
            current.average_standard_pbi,
            previous.average_standard_pbi,
        ),
        average_personalized_pbi_delta=nullable_delta(
            current.average_personalized_pbi,
            previous.average_personalized_pbi,
        ),
        completed_focus_minutes_delta=round(
            current.completed_focus_minutes
            - previous.completed_focus_minutes,
            2,
        ),
        completed_focus_sessions_delta=(
            current.completed_focus_sessions
            - previous.completed_focus_sessions
        ),
        active_focus_days_delta=(
            current.active_focus_days
            - previous.active_focus_days
        ),
        completed_tasks_delta=(
            current.completed_tasks
            - previous.completed_tasks
        ),
        late_or_overdue_tasks_delta=(
            current.late_or_overdue_tasks
            - previous.late_or_overdue_tasks
        ),
    )


# ============================================================
# 5. Deterministic evidence generation
# ============================================================

def build_reflection_evidence(
    current: WeeklyReflectionMetricPayload,
    previous: WeeklyReflectionMetricPayload,
    comparison: WeeklyReflectionComparisonPayload,
) -> list[WeeklyReflectionEvidenceItem]:
    evidence: list[WeeklyReflectionEvidenceItem] = []

    pbi_delta = comparison.average_personalized_pbi_delta

    if pbi_delta is not None:
        if pbi_delta >= 3:
            evidence.append(
                WeeklyReflectionEvidenceItem(
                    key="personalized_pbi_improved",
                    title="Personalized PBI improved",
                    message=f"Your average personalized PBI increased by {pbi_delta:.1f} points compared with the previous 7-day period.",
                    tone="positive",
                )
            )
        elif pbi_delta <= -3:
            evidence.append(
                WeeklyReflectionEvidenceItem(
                    key="personalized_pbi_declined",
                    title="Personalized PBI decreased",
                    message=f"Your average personalized PBI decreased by {abs(pbi_delta):.1f} points compared with the previous 7-day period.",
                    tone="watch",
                )
            )

    if comparison.completed_focus_minutes_delta >= 30:
        evidence.append(
            WeeklyReflectionEvidenceItem(
                key="focus_minutes_increased",
                title="More focused study time",
                message=f"You recorded {comparison.completed_focus_minutes_delta:.0f} more completed focus minutes than in the prior period.",
                tone="positive",
            )
        )
    elif comparison.completed_focus_minutes_delta <= -30:
        evidence.append(
            WeeklyReflectionEvidenceItem(
                key="focus_minutes_decreased",
                title="Focused study time fell",
                message=f"You recorded {abs(comparison.completed_focus_minutes_delta):.0f} fewer completed focus minutes than in the prior period.",
                tone="watch",
            )
        )

    if comparison.active_focus_days_delta >= 1:
        evidence.append(
            WeeklyReflectionEvidenceItem(
                key="active_days_increased",
                title="Study consistency improved",
                message=f"You were active on {comparison.active_focus_days_delta} more focus day(s) than in the comparison period.",
                tone="positive",
            )
        )
    elif comparison.active_focus_days_delta <= -1:
        evidence.append(
            WeeklyReflectionEvidenceItem(
                key="active_days_decreased",
                title="Study consistency softened",
                message=f"You were active on {abs(comparison.active_focus_days_delta)} fewer focus day(s) than in the comparison period.",
                tone="watch",
            )
        )

    if comparison.completed_tasks_delta >= 1:
        evidence.append(
            WeeklyReflectionEvidenceItem(
                key="completed_tasks_increased",
                title="Task completion improved",
                message=f"You completed {comparison.completed_tasks_delta} more task(s) than in the previous period.",
                tone="positive",
            )
        )
    elif comparison.completed_tasks_delta <= -1:
        evidence.append(
            WeeklyReflectionEvidenceItem(
                key="completed_tasks_decreased",
                title="Task completion dropped",
                message=f"You completed {abs(comparison.completed_tasks_delta)} fewer task(s) than in the previous period.",
                tone="watch",
            )
        )

    if comparison.late_or_overdue_tasks_delta <= -1:
        evidence.append(
            WeeklyReflectionEvidenceItem(
                key="deadline_reliability_improved",
                title="Deadline reliability improved",
                message=f"You had {abs(comparison.late_or_overdue_tasks_delta)} fewer late or unresolved due task(s) than before.",
                tone="positive",
            )
        )
    elif comparison.late_or_overdue_tasks_delta >= 1:
        evidence.append(
            WeeklyReflectionEvidenceItem(
                key="deadline_reliability_worsened",
                title="Deadline pressure increased",
                message=f"You had {comparison.late_or_overdue_tasks_delta} more late or unresolved due task(s) than before.",
                tone="watch",
            )
        )

    if not evidence:
        evidence.append(
            WeeklyReflectionEvidenceItem(
                key="behaviour_relatively_stable",
                title="Behaviour remained relatively stable",
                message="The main weekly indicators did not shift strongly compared with the previous 7-day period.",
                tone="neutral",
            )
        )

    return evidence


# ============================================================
# 6. Reflection direction
# ============================================================

def classify_reflection_direction(
    evidence: list[WeeklyReflectionEvidenceItem],
) -> str:
    positive_count = sum(
        item.tone == "positive"
        for item in evidence
    )
    watch_count = sum(
        item.tone == "watch"
        for item in evidence
    )

    if positive_count >= 2 and watch_count == 0:
        return "improving"

    if watch_count >= 2 and positive_count == 0:
        return "needs_attention"

    if positive_count > 0 and watch_count > 0:
        return "mixed"

    return "stable"


# ============================================================
# 7. Persist deterministic reflection
# ============================================================

def persist_weekly_reflection(
    *,
    user_id: UUID,
    windows: dict,
    reflection_direction: str,
    current_metrics: WeeklyReflectionMetricPayload,
    previous_metrics: WeeklyReflectionMetricPayload,
    comparison: WeeklyReflectionComparisonPayload,
    evidence: list[WeeklyReflectionEvidenceItem],
) -> UUID:
    supabase = get_supabase_client()

    result = (
        supabase.table("weekly_reflections")
        .insert(
            {
                "user_id": str(user_id),
                "current_window_start": windows[
                    "current_start"
                ].isoformat(),
                "current_window_end": windows[
                    "current_end"
                ].isoformat(),
                "previous_window_start": windows[
                    "previous_start"
                ].isoformat(),
                "previous_window_end": windows[
                    "previous_end"
                ].isoformat(),
                "reflection_direction": reflection_direction,
                "current_metrics": current_metrics.model_dump(),
                "previous_metrics": previous_metrics.model_dump(),
                "comparison_payload": comparison.model_dump(),
                "evidence_payload": [
                    item.model_dump()
                    for item in evidence
                ],
                "calculation_version": "weekly-reflection-v1",
            }
        )
        .execute()
    )

    return UUID(result.data[0]["id"])


# ============================================================
# 8. Gemini weekly reflection
# ============================================================

def build_gemini_prompt(
    *,
    reflection_direction: str,
    current_metrics: WeeklyReflectionMetricPayload,
    previous_metrics: WeeklyReflectionMetricPayload,
    comparison: WeeklyReflectionComparisonPayload,
    evidence: list[WeeklyReflectionEvidenceItem],
) -> str:
    prompt_payload = {
        "reflection_direction": reflection_direction,
        "current_metrics": current_metrics.model_dump(),
        "previous_metrics": previous_metrics.model_dump(),
        "comparison_payload": comparison.model_dump(),
        "evidence_payload": [
            item.model_dump()
            for item in evidence
        ],
    }

    return f"""
You are the weekly reflection communication layer of Lumivox, an AI-powered learning behaviour analytics platform.

Your task is to generate a concise, student-facing weekly reflection card based ONLY on:
1. The current 7-day behavioural metrics.
2. The previous 7-day comparison metrics.
3. The deterministic evidence payload supplied below.

Important rules:
- Do NOT invent behavioural claims that are not present in the evidence payload.
- Wins must only reference positive evidence keys that appear in evidence_payload.
- Watchouts must only reference watch evidence keys that appear in evidence_payload.
- Recommended actions should logically follow from the evidence and remain realistic, constructive study/productivity actions.
- Do NOT claim certainty about future performance.
- Do NOT mention databases, API services, formulas, or internal implementation details.
- Use encouraging and reflective language, not judgmental language.

Structured context:
{json.dumps(prompt_payload, ensure_ascii=False, indent=2)}
""".strip()


def generate_gemini_weekly_reflection(
    *,
    prompt: str,
) -> GeminiWeeklyReflectionOutput:
    client = get_gemini_client()

    response = client.models.generate_content(
        model=settings.gemini_insight_model,
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "response_json_schema": GeminiWeeklyReflectionOutput.model_json_schema(),
        },
    )

    return GeminiWeeklyReflectionOutput.model_validate_json(
        response.text
    )


def persist_weekly_reflection_card(
    *,
    reflection_id: UUID,
    user_id: UUID,
    card: GeminiWeeklyReflectionOutput,
) -> UUID:
    supabase = get_supabase_client()

    result = (
        supabase.table("weekly_reflection_cards")
        .insert(
            {
                "reflection_id": str(reflection_id),
                "user_id": str(user_id),
                "title": card.title,
                "summary": card.summary,
                "reflection_interpretation": card.reflection_interpretation,
                "wins": [
                    item.model_dump()
                    for item in card.wins
                ],
                "watchouts": [
                    item.model_dump()
                    for item in card.watchouts
                ],
                "next_week_actions": [
                    item.model_dump()
                    for item in card.next_week_actions
                ],
                "confidence_note": card.confidence_note,
                "llm_provider": "google",
                "llm_model": settings.gemini_insight_model,
                "prompt_version": PROMPT_VERSION,
                "structured_output_schema_version": "v1",
                "generation_metadata": {
                    "source": "FastAPI Weekly Reflection Generator",
                },
            }
        )
        .execute()
    )

    return UUID(result.data[0]["id"])


# ============================================================
# 9. Public service entrypoint
# ============================================================

def generate_weekly_reflection(
    payload: GenerateWeeklyReflectionRequest,
) -> GenerateWeeklyReflectionResponse:
    windows = build_reflection_windows()

    current_metrics = aggregate_metrics_for_window(
        user_id=payload.user_id,
        window_start=windows["current_start"],
        window_end=windows["current_end"],
    )

    previous_metrics = aggregate_metrics_for_window(
        user_id=payload.user_id,
        window_start=windows["previous_start"],
        window_end=windows["previous_end"],
    )

    comparison = compare_metrics(
        current_metrics,
        previous_metrics,
    )

    evidence = build_reflection_evidence(
        current=current_metrics,
        previous=previous_metrics,
        comparison=comparison,
    )

    reflection_direction = classify_reflection_direction(evidence)

    reflection_id = None
    card_id = None
    ai_card = None

    if payload.persist_reflection:
        reflection_id = persist_weekly_reflection(
            user_id=payload.user_id,
            windows=windows,
            reflection_direction=reflection_direction,
            current_metrics=current_metrics,
            previous_metrics=previous_metrics,
            comparison=comparison,
            evidence=evidence,
        )

    if payload.generate_ai_card:
        prompt = build_gemini_prompt(
            reflection_direction=reflection_direction,
            current_metrics=current_metrics,
            previous_metrics=previous_metrics,
            comparison=comparison,
            evidence=evidence,
        )

        ai_card = generate_gemini_weekly_reflection(
            prompt=prompt,
        )

        if payload.persist_reflection:
            card_id = persist_weekly_reflection_card(
                reflection_id=reflection_id,
                user_id=payload.user_id,
                card=ai_card,
            )

    return GenerateWeeklyReflectionResponse(
        reflection_id=reflection_id,
        card_id=card_id,
        reflection_direction=reflection_direction,
        current_metrics=current_metrics,
        previous_metrics=previous_metrics,
        comparison_payload=comparison,
        evidence=evidence,
        ai_card=ai_card,
    )