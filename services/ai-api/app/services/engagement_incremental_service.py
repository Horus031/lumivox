from __future__ import annotations

from app.clients.supabase_client import get_supabase_client
from app.schemas.engagement_retention import (
    EngagementStatsPayload,
    ProcessEngagementActivityRequest,
    RecalculateEngagementRequest,
    RecalculateEngagementResponse,
    RewardLedgerEntryPreview,
)
from app.services.engagement_retention_service import recalculate_engagement


def _canonical_reconcile(
    payload: ProcessEngagementActivityRequest,
) -> RecalculateEngagementResponse:
    return recalculate_engagement(
        RecalculateEngagementRequest(
            user_id=payload.user_id,
            persist_results=True,
        )
    )


def process_engagement_activity(
    payload: ProcessEngagementActivityRequest,
) -> RecalculateEngagementResponse:
    """
    Process the common task/focus completion path atomically in Postgres.

    The RPC serializes same-user updates with a row lock, inserts reward rows
    idempotently, and updates streak/token aggregates in the same transaction.
    Rare cases that can change historical streak shape still fall back to the
    canonical reconciliation service.
    """
    supabase = get_supabase_client()

    response = supabase.rpc(
        "process_engagement_activity_atomic",
        {
            "p_user_id": str(payload.user_id),
            "p_activity_type": payload.activity_type,
            "p_activity_id": str(payload.activity_id),
        },
    ).execute()

    data = response.data if response is not None else None

    # Defensive compatibility with clients that wrap scalar RPC results.
    if isinstance(data, list):
        data = data[0] if data else None

    if not isinstance(data, dict) or data.get("status") != "applied":
        return _canonical_reconcile(payload)

    stats_payload = data.get("stats")

    if not isinstance(stats_payload, dict):
        return _canonical_reconcile(payload)

    reward_rows = data.get("newly_created_rewards") or []

    return RecalculateEngagementResponse(
        stats=EngagementStatsPayload(**stats_payload),
        newly_created_rewards=[
            RewardLedgerEntryPreview(**reward)
            for reward in reward_rows
            if isinstance(reward, dict)
        ],
    )
