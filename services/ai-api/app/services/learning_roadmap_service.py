from __future__ import annotations

import os
import time
from datetime import date
from typing import Any
from uuid import uuid4

from supabase import create_client

from app.clients.llm_client import generate_structured
from app.schemas.learning_roadmap import (
    AIRoadmapNode,
    AIRoadmapOutput,
    LearningRoadmapGenerateRequest,
    LearningRoadmapGenerateResponse,
    LearningRoadmapNodeResponse,
)


def _get_supabase_admin():
    supabase_url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_role_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured."
        )

    return create_client(supabase_url, service_role_key)


def _language_instruction(locale: str) -> str:
    if locale == "vi":
        return (
            "Write all roadmap titles and descriptions in Vietnamese. "
            "Technical terms may remain in English when commonly used."
        )

    return "Write all roadmap titles and descriptions in English."


def _level_label(level: str, custom_level: str | None) -> str:
    if level == "custom" and custom_level:
        return custom_level

    return level


def _weekday_label(weekdays: list[str]) -> str:
    if not weekdays:
        return "No specific weekdays selected."

    mapping = {
        "mon": "Monday",
        "tue": "Tuesday",
        "wed": "Wednesday",
        "thu": "Thursday",
        "fri": "Friday",
        "sat": "Saturday",
        "sun": "Sunday",
    }

    return ", ".join(mapping.get(day, day) for day in weekdays)


def _duration_days(start_date: date, end_date: date) -> int:
    return max(1, (end_date - start_date).days + 1)


def _build_generation_prompt(request: LearningRoadmapGenerateRequest) -> str:
    duration_days = _duration_days(request.start_date, request.end_date)

    return f"""
You are an expert learning roadmap designer.

Create a structured learning roadmap that can be rendered as an editable tree.

The roadmap must contain:
- Goal nodes
- Task nodes under goals
- Subtask nodes under tasks

Hierarchy rules:
- A goal has parent_temp_id = null.
- A task must have parent_temp_id pointing to a goal.
- A subtask must have parent_temp_id pointing to a task.
- Do not create cycles.
- Do not create orphan tasks or subtasks.
- Use stable temp_id values such as goal_1, task_1_1, subtask_1_1_1.

User inputs:
- Topic: {request.topic}
- Subject name: {request.subject_name or "Not specified"}
- Description: {request.description or "Not specified"}
- Current level: {_level_label(request.current_level, request.custom_current_level)}
- Target level: {_level_label(request.target_level, request.custom_target_level)}
- Start date: {request.start_date.isoformat()}
- End date: {request.end_date.isoformat()}
- Duration: {duration_days} days
- Study days per week: {request.study_days_per_week}
- Available weekdays: {_weekday_label(request.available_weekdays)}
- Minutes per study day: {request.minutes_per_study_day}

Planning rules:
1. Make the roadmap realistic for the given time range.
2. Break the roadmap into 3 to 6 goals.
3. Each goal should have 2 to 5 tasks.
4. Each task should have 2 to 4 subtasks.
5. Estimate hours based on available study time.
6. Use suggested_start_date and suggested_end_date inside the user's date range.
7. Earlier goals should cover foundations, later goals should cover practice, projects, revision, and assessment.
8. Keep node titles short and actionable.
9. Descriptions should explain what the learner needs to do.
10. Priority must be 1 to 5, where 5 is most important.
11. sort_order should start at 0 within each parent.
12. The output must be valid JSON matching the provided schema.
13. Do not include Markdown outside JSON.
14. {_language_instruction(request.preferred_locale)}

Important:
The output will be saved directly to a database and rendered as a visual tree, so the hierarchy must be clean and consistent.
""".strip()


def _validate_ai_tree(output: AIRoadmapOutput) -> None:
    temp_ids = set()
    nodes_by_temp_id: dict[str, AIRoadmapNode] = {}

    for node in output.nodes:
        if node.temp_id in temp_ids:
            raise ValueError(f"Duplicate temp_id found: {node.temp_id}")

        temp_ids.add(node.temp_id)
        nodes_by_temp_id[node.temp_id] = node

    goal_count = 0

    for node in output.nodes:
        if node.node_type == "goal":
            goal_count += 1

            if node.parent_temp_id is not None:
                raise ValueError(f"Goal node {node.temp_id} must not have a parent.")

        if node.node_type in {"task", "subtask"}:
            if not node.parent_temp_id:
                raise ValueError(f"{node.node_type} node {node.temp_id} must have a parent.")

            parent = nodes_by_temp_id.get(node.parent_temp_id)

            if not parent:
                raise ValueError(
                    f"Parent {node.parent_temp_id} for node {node.temp_id} was not found."
                )

            if node.node_type == "task" and parent.node_type != "goal":
                raise ValueError(f"Task {node.temp_id} must be under a goal.")

            if node.node_type == "subtask" and parent.node_type != "task":
                raise ValueError(f"Subtask {node.temp_id} must be under a task.")

    if goal_count < 1:
        raise ValueError("Roadmap must contain at least one goal.")


def _calculate_positions(nodes: list[AIRoadmapNode]) -> dict[str, tuple[float, float]]:
    children_by_parent: dict[str | None, list[AIRoadmapNode]] = {}

    for node in nodes:
        children_by_parent.setdefault(node.parent_temp_id, []).append(node)

    for siblings in children_by_parent.values():
        siblings.sort(key=lambda item: item.sort_order)

    positions: dict[str, tuple[float, float]] = {}

    root_goals = children_by_parent.get(None, [])

    goal_spacing_x = 520
    task_spacing_x = 260
    subtask_spacing_x = 220

    for goal_index, goal in enumerate(root_goals):
        goal_x = goal_index * goal_spacing_x
        positions[goal.temp_id] = (goal_x, 0)

        tasks = children_by_parent.get(goal.temp_id, [])
        task_start_x = goal_x - ((len(tasks) - 1) * task_spacing_x / 2)

        for task_index, task in enumerate(tasks):
            task_x = task_start_x + task_index * task_spacing_x
            positions[task.temp_id] = (task_x, 260)

            subtasks = children_by_parent.get(task.temp_id, [])
            subtask_start_x = task_x - ((len(subtasks) - 1) * subtask_spacing_x / 2)

            for subtask_index, subtask in enumerate(subtasks):
                subtask_x = subtask_start_x + subtask_index * subtask_spacing_x
                positions[subtask.temp_id] = (subtask_x, 520)

    return positions


def _insert_roadmap(
    supabase: Any,
    *,
    request: LearningRoadmapGenerateRequest,
    output: AIRoadmapOutput,
    prompt: str,
    provider: str | None,
    model_name: str | None,
    latency_ms: int | None,
) -> str:
    response = (
        supabase.table("learning_roadmaps")
        .insert(
            {
                "user_id": request.user_id,
                "title": output.title,
                "topic": request.topic,
                "subject_name": request.subject_name,
                "description": output.description or request.description,
                "current_level": request.current_level,
                "target_level": request.target_level,
                "custom_current_level": request.custom_current_level,
                "custom_target_level": request.custom_target_level,
                "start_date": request.start_date.isoformat(),
                "end_date": request.end_date.isoformat(),
                "study_days_per_week": request.study_days_per_week,
                "available_weekdays": request.available_weekdays,
                "minutes_per_study_day": request.minutes_per_study_day,
                "preferred_locale": request.preferred_locale,
                "status": "draft",
                "generation_input": request.model_dump(mode="json"),
                "source_prompt": prompt,
                "ai_provider": provider,
                "ai_model": model_name,
                "ai_latency_ms": latency_ms,
            }
        )
        .execute()
    )

    if not response.data:
        raise RuntimeError("Failed to create learning roadmap.")

    return response.data[0]["id"]


def _insert_nodes(
    supabase: Any,
    *,
    request: LearningRoadmapGenerateRequest,
    roadmap_id: str,
    output: AIRoadmapOutput,
) -> list[LearningRoadmapNodeResponse]:
    positions = _calculate_positions(output.nodes)

    id_by_temp_id = {
        node.temp_id: str(uuid4())
        for node in output.nodes
    }

    rows: list[dict[str, Any]] = []

    for node in output.nodes:
        x, y = positions.get(node.temp_id, (0, 0))

        rows.append(
            {
                "id": id_by_temp_id[node.temp_id],
                "roadmap_id": roadmap_id,
                "user_id": request.user_id,
                "parent_node_id": (
                    id_by_temp_id.get(node.parent_temp_id)
                    if node.parent_temp_id
                    else None
                ),
                "node_type": node.node_type,
                "title": node.title,
                "description": node.description,
                "estimated_hours": node.estimated_hours,
                "suggested_start_date": (
                    node.suggested_start_date.isoformat()
                    if node.suggested_start_date
                    else None
                ),
                "suggested_end_date": (
                    node.suggested_end_date.isoformat()
                    if node.suggested_end_date
                    else None
                ),
                "priority": node.priority,
                "sort_order": node.sort_order,
                "position_x": x,
                "position_y": y,
                "metadata": {
                    "ai_temp_id": node.temp_id,
                    "ai_parent_temp_id": node.parent_temp_id,
                },
            }
        )

    response = (
        supabase.table("learning_roadmap_nodes")
        .insert(rows)
        .execute()
    )

    if not response.data:
        raise RuntimeError("Failed to create roadmap nodes.")

    inserted = sorted(
        response.data,
        key=lambda item: (
            item.get("position_y", 0),
            item.get("position_x", 0),
            item.get("sort_order", 0),
        ),
    )

    return [
        LearningRoadmapNodeResponse(
            id=row["id"],
            roadmap_id=row["roadmap_id"],
            parent_node_id=row.get("parent_node_id"),
            node_type=row["node_type"],
            title=row["title"],
            description=row.get("description"),
            estimated_hours=float(row["estimated_hours"]),
            suggested_start_date=row.get("suggested_start_date"),
            suggested_end_date=row.get("suggested_end_date"),
            priority=row["priority"],
            sort_order=row["sort_order"],
            position_x=float(row["position_x"]),
            position_y=float(row["position_y"]),
        )
        for row in inserted
    ]


def generate_learning_roadmap(
    request: LearningRoadmapGenerateRequest,
) -> LearningRoadmapGenerateResponse:
    started_at = time.perf_counter()
    supabase = _get_supabase_admin()

    prompt = _build_generation_prompt(request)

    generation = generate_structured(
        prompt=prompt,
        output_model=AIRoadmapOutput,
        schema_name="learning_roadmap",
    )

    output = generation.output

    _validate_ai_tree(output)

    total_latency_ms = int((time.perf_counter() - started_at) * 1000)

    roadmap_id = _insert_roadmap(
        supabase,
        request=request,
        output=output,
        prompt=prompt,
        provider=generation.provider,
        model_name=generation.model,
        latency_ms=total_latency_ms,
    )

    nodes = _insert_nodes(
        supabase,
        request=request,
        roadmap_id=roadmap_id,
        output=output,
    )

    return LearningRoadmapGenerateResponse(
        roadmap_id=roadmap_id,
        title=output.title,
        description=output.description,
        nodes=nodes,
        provider=generation.provider,
        model_name=generation.model,
        latency_ms=total_latency_ms,
    )