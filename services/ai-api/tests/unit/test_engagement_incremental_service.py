from uuid import uuid4

from app.schemas.engagement_retention import (
    EngagementStatsPayload,
    ProcessEngagementActivityRequest,
    RecalculateEngagementResponse,
)
from app.services import engagement_incremental_service as service


class _RpcResponse:
    def __init__(self, data):
        self.data = data


class _RpcCall:
    def __init__(self, data):
        self._data = data

    def execute(self):
        return _RpcResponse(self._data)


class _SupabaseStub:
    def __init__(self, data):
        self.data = data
        self.calls = []

    def rpc(self, name, params):
        self.calls.append((name, params))
        return _RpcCall(self.data)


def _stats_payload():
    return {
        "current_streak_days": 3,
        "longest_streak_days": 4,
        "latest_active_study_date": "2026-09-22",
        "last_valid_activity_date": "2026-09-22",
        "streak_status": "active",
        "streak_freeze_started_at": None,
        "streak_restore_deadline_at": None,
        "can_restore_streak": False,
        "restore_cost_tokens": 30,
        "token_balance": 133,
        "total_tokens_earned": 173,
        "total_tokens_spent": 40,
        "tokens_earned_last_7d": 63,
        "completed_focus_sessions_total": 8,
        "valid_focus_sessions_total": 7,
        "completed_tasks_total": 13,
        "valid_completed_tasks_total": 11,
    }


def test_process_activity_uses_atomic_rpc(monkeypatch):
    user_id = uuid4()
    activity_id = uuid4()
    stub = _SupabaseStub(
        {
            "status": "applied",
            "source_was_new": True,
            "stats": _stats_payload(),
            "newly_created_rewards": [
                {
                    "event_type": "task_completed",
                    "token_delta": 10,
                    "source_key": f"task_completed:{activity_id}",
                    "reward_note": "Completed a valid task.",
                }
            ],
        }
    )

    monkeypatch.setattr(service, "get_supabase_client", lambda: stub)

    result = service.process_engagement_activity(
        ProcessEngagementActivityRequest(
            user_id=user_id,
            activity_type="task",
            activity_id=activity_id,
        )
    )

    assert result.stats.token_balance == 133
    assert result.stats.valid_completed_tasks_total == 11
    assert len(result.newly_created_rewards) == 1
    assert stub.calls == [
        (
            "process_engagement_activity_atomic",
            {
                "p_user_id": str(user_id),
                "p_activity_type": "task",
                "p_activity_id": str(activity_id),
            },
        )
    ]


def test_duplicate_activity_returns_atomic_snapshot(monkeypatch):
    stub = _SupabaseStub(
        {
            "status": "applied",
            "source_was_new": False,
            "stats": _stats_payload(),
            "newly_created_rewards": [],
        }
    )
    monkeypatch.setattr(service, "get_supabase_client", lambda: stub)

    result = service.process_engagement_activity(
        ProcessEngagementActivityRequest(
            user_id=uuid4(),
            activity_type="focus_session",
            activity_id=uuid4(),
        )
    )

    assert result.stats.current_streak_days == 3
    assert result.newly_created_rewards == []


def test_requires_reconcile_falls_back_to_canonical(monkeypatch):
    expected = RecalculateEngagementResponse(
        stats=EngagementStatsPayload(**_stats_payload()),
        newly_created_rewards=[],
    )
    stub = _SupabaseStub(
        {
            "status": "requires_reconcile",
            "reason": "out_of_order_activity",
        }
    )

    monkeypatch.setattr(service, "get_supabase_client", lambda: stub)
    monkeypatch.setattr(
        service,
        "recalculate_engagement",
        lambda _payload: expected,
    )

    result = service.process_engagement_activity(
        ProcessEngagementActivityRequest(
            user_id=uuid4(),
            activity_type="task",
            activity_id=uuid4(),
        )
    )

    assert result is expected
