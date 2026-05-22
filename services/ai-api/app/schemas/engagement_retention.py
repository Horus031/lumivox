from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class RecalculateEngagementRequest(BaseModel):
    user_id: UUID
    persist_results: bool = True


class RewardLedgerEntryPreview(BaseModel):
    event_type: Literal[
        "focus_session_completed",
        "task_completed",
        "daily_streak_continued",
        "streak_milestone_3",
        "streak_milestone_7",
        "streak_restored_with_tokens",
    ]
    token_delta: int
    source_key: str
    reward_note: str


class EngagementStatsPayload(BaseModel):
    current_streak_days: int
    longest_streak_days: int
    latest_active_study_date: str | None
    last_valid_activity_date: str | None

    streak_status: Literal["active", "frozen", "lost"]
    streak_freeze_started_at: str | None
    streak_restore_deadline_at: str | None
    can_restore_streak: bool
    restore_cost_tokens: int

    token_balance: int
    total_tokens_earned: int
    total_tokens_spent: int
    tokens_earned_last_7d: int

    completed_focus_sessions_total: int
    valid_focus_sessions_total: int
    completed_tasks_total: int
    valid_completed_tasks_total: int


class RecalculateEngagementResponse(BaseModel):
    stats: EngagementStatsPayload
    newly_created_rewards: list[RewardLedgerEntryPreview]