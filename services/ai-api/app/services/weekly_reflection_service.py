from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from statistics import mean
from uuid import UUID

from app.clients.llm_client import LLMStructuredGeneration, generate_structured
from app.clients.supabase_client import get_supabase_client
from app.schemas.weekly_reflection import (
    GeminiWeeklyReflectionOutput,
    GenerateWeeklyReflectionRequest,
    GenerateWeeklyReflectionResponse,
    WeeklyReflectionComparisonPayload,
    WeeklyReflectionEvidenceItem,
    WeeklyReflectionMetricPayload,
)

from app.services.review_mastery_analytics import (
    summarize_review_mastery,
)


PROMPT_VERSION = (
    "weekly-reflection-v2"
)

CALCULATION_VERSION = (
    "weekly-reflection-v2"
)


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
    supabase = (
        get_supabase_client()
    )

    user_id_text = str(
        user_id
    )

    # ========================================================
    # 1. Completed focus sessions
    # ========================================================

    focus_result = (
        supabase
        .table(
            "focus_sessions"
        )
        .select(
            (
                "id,"
                "ended_at,"
                "status,"
                "actual_focus_minutes"
            )
        )
        .eq(
            "user_id",
            user_id_text,
        )
        .eq(
            "status",
            "completed",
        )
        .gte(
            "ended_at",
            window_start
            .isoformat(),
        )
        .lt(
            "ended_at",
            window_end
            .isoformat(),
        )
        .execute()
    )

    focus_sessions = (
        focus_result.data
        or []
    )

    completed_focus_minutes = (
        0.0
    )

    active_focus_days: set[
        str
    ] = set()

    for session in (
        focus_sessions
    ):
        completed_focus_minutes += (
            float(
                session.get(
                    "actual_focus_minutes"
                )
                or 0
            )
        )

        ended_at = parse_dt(
            session.get(
                "ended_at"
            )
        )

        if ended_at:
            active_focus_days.add(
                ended_at
                .date()
                .isoformat()
            )

    # ========================================================
    # 2. Completed ROOT tasks
    #
    # Subtasks must not independently increase the weekly
    # completion metric.
    # ========================================================

    completed_tasks_result = (
        supabase
        .table("tasks")
        .select(
            (
                "id,"
                "parent_task_id,"
                "status,"
                "completed_at"
            )
        )
        .eq(
            "user_id",
            user_id_text,
        )
        .filter(
            "parent_task_id",
            "is",
            "null",
        )
        .eq(
            "status",
            "completed",
        )
        .gte(
            "completed_at",
            window_start
            .isoformat(),
        )
        .lt(
            "completed_at",
            window_end
            .isoformat(),
        )
        .execute()
    )

    completed_tasks_count = (
        len(
            completed_tasks_result
            .data
            or []
        )
    )

    # ========================================================
    # 3. ROOT tasks due during this window
    #
    # Cancelled Tasks are not late work.
    # ========================================================

    due_tasks_result = (
        supabase
        .table("tasks")
        .select(
            (
                "id,"
                "parent_task_id,"
                "status,"
                "due_at,"
                "completed_at"
            )
        )
        .eq(
            "user_id",
            user_id_text,
        )
        .filter(
            "parent_task_id",
            "is",
            "null",
        )
        .neq(
            "status",
            "cancelled",
        )
        .gte(
            "due_at",
            window_start
            .isoformat(),
        )
        .lt(
            "due_at",
            window_end
            .isoformat(),
        )
        .execute()
    )

    due_tasks = (
        due_tasks_result.data
        or []
    )

    late_or_overdue_tasks = 0

    for task in due_tasks:
        status = task.get(
            "status"
        )

        # Defensive protection in case query semantics change
        # in the future.
        if status == "cancelled":
            continue

        if (
            task.get(
                "parent_task_id"
            )
            is not None
        ):
            continue

        due_at = parse_dt(
            task.get(
                "due_at"
            )
        )

        completed_at = parse_dt(
            task.get(
                "completed_at"
            )
        )

        if due_at is None:
            continue

        is_completed_late = (
            status
            == "completed"
            and completed_at
            is not None
            and completed_at
            > due_at
        )

        is_unresolved_after_deadline = (
            status
            not in {
                "completed",
                "cancelled",
            }
            and due_at
            < window_end
        )

        if (
            is_completed_late
            or
            is_unresolved_after_deadline
        ):
            late_or_overdue_tasks += 1

    # ========================================================
    # 4. PBI snapshots
    #
    # PBI remains behavioural only.
    # ========================================================

    pbi_result = (
        supabase
        .table(
            "pbi_snapshots"
        )
        .select("*")
        .eq(
            "user_id",
            user_id_text,
        )
        .gte(
            "created_at",
            window_start
            .isoformat(),
        )
        .lt(
            "created_at",
            window_end
            .isoformat(),
        )
        .execute()
    )

    pbi_snapshots = (
        pbi_result.data
        or []
    )

    standard_values: list[
        float
    ] = []

    personalized_values: list[
        float
    ] = []

    for snapshot in (
        pbi_snapshots
    ):
        standard_value = (
            pick_numeric(
                snapshot,
                [
                    (
                        "standard_"
                        "pbi_score"
                    ),
                    "standard_pbi",
                    "standard_score",
                ],
            )
        )

        personalized_value = (
            pick_numeric(
                snapshot,
                [
                    (
                        "personalized_"
                        "pbi_score"
                    ),
                    (
                        "personalized_"
                        "pbi"
                    ),
                    (
                        "personalized_"
                        "score"
                    ),
                ],
            )
        )

        if (
            standard_value
            is not None
        ):
            standard_values.append(
                standard_value
            )

        if (
            personalized_value
            is not None
        ):
            personalized_values.append(
                personalized_value
            )

    average_standard_pbi = (
        safe_round(
            mean(
                standard_values
            )
        )
        if standard_values
        else None
    )

    average_personalized_pbi = (
        safe_round(
            mean(
                personalized_values
            )
        )
        if personalized_values
        else None
    )

    # ========================================================
    # 5. AI Review mastery signals
    #
    # Only finalized attempts are used.
    # Generation failures/readiness do not represent mastery.
    # ========================================================

    review_result = (
        supabase
        .table(
            "task_review_attempts"
        )
        .select(
            (
                "task_id,"
                "status,"
                "score,"
                "weak_areas,"
                "completed_at"
            )
        )
        .eq(
            "user_id",
            user_id_text,
        )
        .in_(
            "status",
            [
                "passed",
                "failed",
            ],
        )
        .gte(
            "completed_at",
            window_start
            .isoformat(),
        )
        .lt(
            "completed_at",
            window_end
            .isoformat(),
        )
        .execute()
    )

    mastery = (
        summarize_review_mastery(
            review_result.data
            or []
        )
    )

    return (
        WeeklyReflectionMetricPayload(
            average_standard_pbi=(
                average_standard_pbi
            ),

            average_personalized_pbi=(
                average_personalized_pbi
            ),

            completed_focus_minutes=(
                round(
                    completed_focus_minutes,
                    2,
                )
            ),

            completed_focus_sessions=(
                len(
                    focus_sessions
                )
            ),

            active_focus_days=(
                len(
                    active_focus_days
                )
            ),

            completed_tasks=(
                completed_tasks_count
            ),

            late_or_overdue_tasks=(
                late_or_overdue_tasks
            ),

            review_attempts=(
                mastery[
                    "review_attempts"
                ]
            ),

            reviewed_tasks=(
                mastery[
                    "reviewed_tasks"
                ]
            ),

            passed_review_attempts=(
                mastery[
                    (
                        "passed_"
                        "review_attempts"
                    )
                ]
            ),

            failed_review_attempts=(
                mastery[
                    (
                        "failed_"
                        "review_attempts"
                    )
                ]
            ),

            review_pass_rate=(
                mastery[
                    "review_pass_rate"
                ]
            ),

            average_review_score=(
                mastery[
                    (
                        "average_"
                        "review_score"
                    )
                ]
            ),

            top_review_weak_areas=(
                mastery[
                    (
                        "top_review_"
                        "weak_areas"
                    )
                ]
            ),
        )
    )


# ============================================================
# 4. Comparison
# ============================================================

def compare_metrics(
    current:
        WeeklyReflectionMetricPayload,

    previous:
        WeeklyReflectionMetricPayload,
) -> WeeklyReflectionComparisonPayload:
    def nullable_delta(
        a: float | None,
        b: float | None,
    ) -> float | None:
        if (
            a is None
            or b is None
        ):
            return None

        return round(
            a - b,
            2,
        )

    return (
        WeeklyReflectionComparisonPayload(
            average_standard_pbi_delta=(
                nullable_delta(
                    current
                    .average_standard_pbi,

                    previous
                    .average_standard_pbi,
                )
            ),

            average_personalized_pbi_delta=(
                nullable_delta(
                    current
                    .average_personalized_pbi,

                    previous
                    .average_personalized_pbi,
                )
            ),

            completed_focus_minutes_delta=(
                round(
                    (
                        current
                        .completed_focus_minutes

                        - previous
                        .completed_focus_minutes
                    ),
                    2,
                )
            ),

            completed_focus_sessions_delta=(
                current
                .completed_focus_sessions

                - previous
                .completed_focus_sessions
            ),

            active_focus_days_delta=(
                current
                .active_focus_days

                - previous
                .active_focus_days
            ),

            completed_tasks_delta=(
                current
                .completed_tasks

                - previous
                .completed_tasks
            ),

            late_or_overdue_tasks_delta=(
                current
                .late_or_overdue_tasks

                - previous
                .late_or_overdue_tasks
            ),

            review_attempts_delta=(
                current
                .review_attempts

                - previous
                .review_attempts
            ),

            reviewed_tasks_delta=(
                current
                .reviewed_tasks

                - previous
                .reviewed_tasks
            ),

            review_pass_rate_delta=(
                nullable_delta(
                    current
                    .review_pass_rate,

                    previous
                    .review_pass_rate,
                )
            ),

            average_review_score_delta=(
                nullable_delta(
                    current
                    .average_review_score,

                    previous
                    .average_review_score,
                )
            ),
        )
    )


# ============================================================
# 5. Deterministic evidence generation
# ============================================================

def build_reflection_evidence(
    current:
        WeeklyReflectionMetricPayload,

    previous:
        WeeklyReflectionMetricPayload,

    comparison:
        WeeklyReflectionComparisonPayload,
) -> list[
    WeeklyReflectionEvidenceItem
]:
    evidence: list[
        WeeklyReflectionEvidenceItem
    ] = []

    # ========================================================
    # BEHAVIOURAL EVIDENCE
    # ========================================================

    pbi_delta = (
        comparison
        .average_personalized_pbi_delta
    )

    if pbi_delta is not None:
        if pbi_delta >= 3:
            evidence.append(
                WeeklyReflectionEvidenceItem(
                    key=(
                        "personalized_"
                        "pbi_improved"
                    ),

                    title=(
                        "Personalized "
                        "PBI improved"
                    ),

                    message=(
                        "Your average personalized "
                        "PBI increased by "
                        f"{pbi_delta:.1f} points "
                        "compared with the previous "
                        "7-day period."
                    ),

                    tone="positive",
                )
            )

        elif pbi_delta <= -3:
            evidence.append(
                WeeklyReflectionEvidenceItem(
                    key=(
                        "personalized_"
                        "pbi_declined"
                    ),

                    title=(
                        "Personalized "
                        "PBI decreased"
                    ),

                    message=(
                        "Your average personalized "
                        "PBI decreased by "
                        f"{abs(pbi_delta):.1f} "
                        "points compared with the "
                        "previous 7-day period."
                    ),

                    tone="watch",
                )
            )

    if (
        comparison
        .completed_focus_minutes_delta
        >= 30
    ):
        evidence.append(
            WeeklyReflectionEvidenceItem(
                key=(
                    "focus_minutes_"
                    "increased"
                ),

                title=(
                    "More focused study time"
                ),

                message=(
                    "You recorded "
                    f"{comparison.completed_focus_minutes_delta:.0f} "
                    "more completed focus minutes "
                    "than in the prior period."
                ),

                tone="positive",
            )
        )

    elif (
        comparison
        .completed_focus_minutes_delta
        <= -30
    ):
        evidence.append(
            WeeklyReflectionEvidenceItem(
                key=(
                    "focus_minutes_"
                    "decreased"
                ),

                title=(
                    "Focused study time fell"
                ),

                message=(
                    "You recorded "
                    f"{abs(comparison.completed_focus_minutes_delta):.0f} "
                    "fewer completed focus minutes "
                    "than in the prior period."
                ),

                tone="watch",
            )
        )

    if (
        comparison
        .active_focus_days_delta
        >= 1
    ):
        evidence.append(
            WeeklyReflectionEvidenceItem(
                key=(
                    "active_days_"
                    "increased"
                ),

                title=(
                    "Study consistency improved"
                ),

                message=(
                    "You were active on "
                    f"{comparison.active_focus_days_delta} "
                    "more focus day(s) than in "
                    "the comparison period."
                ),

                tone="positive",
            )
        )

    elif (
        comparison
        .active_focus_days_delta
        <= -1
    ):
        evidence.append(
            WeeklyReflectionEvidenceItem(
                key=(
                    "active_days_"
                    "decreased"
                ),

                title=(
                    "Study consistency softened"
                ),

                message=(
                    "You were active on "
                    f"{abs(comparison.active_focus_days_delta)} "
                    "fewer focus day(s) than in "
                    "the comparison period."
                ),

                tone="watch",
            )
        )

    if (
        comparison
        .completed_tasks_delta
        >= 1
    ):
        evidence.append(
            WeeklyReflectionEvidenceItem(
                key=(
                    "completed_tasks_"
                    "increased"
                ),

                title=(
                    "Task completion improved"
                ),

                message=(
                    "You completed "
                    f"{comparison.completed_tasks_delta} "
                    "more root task(s) than in "
                    "the previous period."
                ),

                tone="positive",
            )
        )

    elif (
        comparison
        .completed_tasks_delta
        <= -1
    ):
        evidence.append(
            WeeklyReflectionEvidenceItem(
                key=(
                    "completed_tasks_"
                    "decreased"
                ),

                title=(
                    "Task completion dropped"
                ),

                message=(
                    "You completed "
                    f"{abs(comparison.completed_tasks_delta)} "
                    "fewer root task(s) than in "
                    "the previous period."
                ),

                tone="watch",
            )
        )

    if (
        comparison
        .late_or_overdue_tasks_delta
        <= -1
    ):
        evidence.append(
            WeeklyReflectionEvidenceItem(
                key=(
                    "deadline_reliability_"
                    "improved"
                ),

                title=(
                    "Deadline reliability improved"
                ),

                message=(
                    "You had "
                    f"{abs(comparison.late_or_overdue_tasks_delta)} "
                    "fewer late or unresolved "
                    "root task(s) than before."
                ),

                tone="positive",
            )
        )

    elif (
        comparison
        .late_or_overdue_tasks_delta
        >= 1
    ):
        evidence.append(
            WeeklyReflectionEvidenceItem(
                key=(
                    "deadline_reliability_"
                    "worsened"
                ),

                title=(
                    "Deadline pressure increased"
                ),

                message=(
                    "You had "
                    f"{comparison.late_or_overdue_tasks_delta} "
                    "more late or unresolved "
                    "root task(s) than before."
                ),

                tone="watch",
            )
        )

    # Keep the old stable-behaviour signal even when mastery
    # evidence is added later.
    if not evidence:
        evidence.append(
            WeeklyReflectionEvidenceItem(
                key=(
                    "behaviour_"
                    "relatively_stable"
                ),

                title=(
                    "Behaviour remained "
                    "relatively stable"
                ),

                message=(
                    "The main behavioural "
                    "indicators did not shift "
                    "strongly compared with the "
                    "previous 7-day period."
                ),

                tone="neutral",
            )
        )

    # ========================================================
    # MASTERY EVIDENCE
    #
    # Mastery may influence the reflection, but never PBI.
    #
    # Require at least TWO reviewed tasks before creating a
    # directional mastery claim. Two attempts of the same Task
    # are still a small sample.
    # ========================================================

    mastery_direction_added = (
        False
    )

    if (
        current.reviewed_tasks
        >= 2
        and previous.reviewed_tasks
        >= 2
    ):
        score_delta = (
            comparison
            .average_review_score_delta
        )

        if (
            score_delta
            is not None
            and score_delta >= 10
        ):
            evidence.append(
                WeeklyReflectionEvidenceItem(
                    key=(
                        "review_score_"
                        "improved"
                    ),

                    title=(
                        "Review mastery improved"
                    ),

                    message=(
                        "Across reviewed tasks, "
                        "your average AI Review "
                        "score increased by "
                        f"{score_delta:.1f} points "
                        "compared with the prior "
                        "period."
                    ),

                    tone="positive",
                )
            )

            mastery_direction_added = (
                True
            )

        elif (
            score_delta
            is not None
            and score_delta <= -10
        ):
            evidence.append(
                WeeklyReflectionEvidenceItem(
                    key=(
                        "review_score_"
                        "declined"
                    ),

                    title=(
                        "Review scores softened"
                    ),

                    message=(
                        "Across reviewed tasks, "
                        "your average AI Review "
                        "score decreased by "
                        f"{abs(score_delta):.1f} "
                        "points compared with the "
                        "prior period."
                    ),

                    tone="watch",
                )
            )

            mastery_direction_added = (
                True
            )

    if (
        not mastery_direction_added
        and current.reviewed_tasks
        >= 2
    ):
        pass_rate = (
            current
            .review_pass_rate
        )

        average_score = (
            current
            .average_review_score
        )

        if (
            pass_rate
            is not None
            and average_score
            is not None
            and pass_rate >= 80
            and average_score >= 75
        ):
            evidence.append(
                WeeklyReflectionEvidenceItem(
                    key=(
                        "review_mastery_"
                        "strong"
                    ),

                    title=(
                        "Review mastery was strong"
                    ),

                    message=(
                        "Across "
                        f"{current.reviewed_tasks} "
                        "reviewed task(s), your "
                        "AI Review pass rate was "
                        f"{pass_rate:.1f}% with an "
                        "average score of "
                        f"{average_score:.1f}%."
                    ),

                    tone="positive",
                )
            )

        elif (
            (
                pass_rate
                is not None
                and pass_rate < 50
            )
            or
            (
                average_score
                is not None
                and average_score < 60
            )
        ):
            evidence.append(
                WeeklyReflectionEvidenceItem(
                    key=(
                        "review_mastery_"
                        "needs_attention"
                    ),

                    title=(
                        "Some reviewed topics "
                        "need more study"
                    ),

                    message=(
                        "Across "
                        f"{current.reviewed_tasks} "
                        "reviewed task(s), the "
                        "current review results "
                        "suggest that some topics "
                        "would benefit from "
                        "additional practice."
                    ),

                    tone="watch",
                )
            )

    # Weak areas are useful context, but do not by themselves
    # make the overall reflection positive or negative.
    if (
        current
        .top_review_weak_areas
    ):
        weak_area_text = ", ".join(
            current
            .top_review_weak_areas
        )

        evidence.append(
            WeeklyReflectionEvidenceItem(
                key=(
                    "review_topics_"
                    "to_revisit"
                ),

                title=(
                    "Review topics to revisit"
                ),

                message=(
                    "Incorrect review answers "
                    "this period most often "
                    "pointed to: "
                    f"{weak_area_text}."
                ),

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
                "calculation_version": CALCULATION_VERSION,
            }
        )
        .execute()
    )

    return UUID(result.data[0]["id"])


# ============================================================
# 8. LLM weekly reflection
# ============================================================

def build_llm_prompt(
    *,
    reflection_direction: str,
    current_metrics:
        WeeklyReflectionMetricPayload,
    previous_metrics:
        WeeklyReflectionMetricPayload,
    comparison:
        WeeklyReflectionComparisonPayload,
    evidence:
        list[
            WeeklyReflectionEvidenceItem
        ],
) -> str:
    prompt_payload = {
        "reflection_direction":
            reflection_direction,

        "current_metrics":
            current_metrics
            .model_dump(),

        "previous_metrics":
            previous_metrics
            .model_dump(),

        "comparison_payload":
            comparison
            .model_dump(),

        "evidence_payload": [
            item.model_dump()
            for item in evidence
        ],
    }

    return f"""
You are the weekly reflection communication layer of Lumivox.

Your task is to generate a concise, student-facing weekly reflection based ONLY on the supplied deterministic analytics.

The analytics contain two distinct categories:

1. BEHAVIOURAL signals:
   - Personal Behavior Index (PBI)
   - focus activity
   - root-task completion
   - deadline adherence
   - consistency

2. MASTERY signals:
   - finalized AI Review attempts
   - review scores
   - review pass rate
   - recurring review topics to revisit

These categories MUST remain conceptually separate.

Important rules:

1. PBI measures recorded behaviour. It does NOT measure mastery, intelligence, academic ability or grades.

2. AI Review scores are task-specific mastery checks. They must NOT be mathematically combined with PBI or described as part of PBI.

3. Do NOT infer intelligence, aptitude, academic success, mental state or personal worth from either PBI or review results.

4. When fewer than two distinct tasks were reviewed in a period, treat mastery evidence as limited. Do not generalize one Task's result into a broad claim about the learner.

5. A failed review means that the specific reviewed concepts may benefit from more study. It does NOT mean the learner is generally weak.

6. Weak areas are learning topics to revisit, not labels describing the learner.

7. Do NOT invent behavioural or mastery claims that are absent from evidence_payload.

8. Wins must reference only positive evidence keys that appear in evidence_payload.

9. Watchouts must reference only watch evidence keys that appear in evidence_payload.

10. Recommended actions may logically follow from positive, watch or neutral evidence, including review topics to revisit.

11. Do NOT claim certainty about future performance.

12. Do NOT mention databases, API services, formulas, model internals or implementation details.

13. Use encouraging, specific and reflective language rather than judgmental language.

Structured analytics:
{json.dumps(
    prompt_payload,
    ensure_ascii=False,
    indent=2,
)}
""".strip()


def generate_llm_weekly_reflection(
    *,
    prompt: str,
) -> LLMStructuredGeneration[GeminiWeeklyReflectionOutput]:
    return generate_structured(
        prompt=prompt,
        output_model=GeminiWeeklyReflectionOutput,
        schema_name="weekly_reflection",
    )


def persist_weekly_reflection_card(
    *,
    reflection_id: UUID,
    user_id: UUID,
    card: GeminiWeeklyReflectionOutput,
    generation: LLMStructuredGeneration[GeminiWeeklyReflectionOutput],
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
                "llm_provider": generation.provider,
                "llm_model": generation.model,
                "prompt_version": PROMPT_VERSION,
                "structured_output_schema_version": "v1",
                "generation_metadata": {
                    "source": (
                        "FastAPI Weekly Reflection Generator"
                    ),

                    "provider":
                        generation.provider,

                    "model":
                        generation.model,

                    "latency_ms":
                        generation.latency_ms,

                    "attempts":
                        generation.attempts,

                    "analytics_version":
                        CALCULATION_VERSION,
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
        prompt = build_llm_prompt(
            reflection_direction=reflection_direction,
            current_metrics=current_metrics,
            previous_metrics=previous_metrics,
            comparison=comparison,
            evidence=evidence,
        )

        generation = generate_llm_weekly_reflection(
            prompt=prompt,
        )
        ai_card = generation.output

        if payload.persist_reflection:
            card_id = persist_weekly_reflection_card(
                reflection_id=reflection_id,
                user_id=payload.user_id,
                card=ai_card,
                generation=generation,
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
