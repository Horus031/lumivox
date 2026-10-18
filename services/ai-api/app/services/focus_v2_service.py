from postgrest.exceptions import APIError

from app.clients.supabase_client import get_supabase_client
from app.schemas.focus_v2 import CreateFocusV2Request, TransitionFocusV2Request


class FocusV2Conflict(Exception):
    pass


class FocusV2BadRequest(Exception):
    pass


def _rpc(name: str, arguments: dict):
    try:
        response = get_supabase_client().rpc(name, arguments).execute()
        return response.data
    except APIError as exc:
        code = str(exc.code or "")
        if code in ("23505", "P0001"):
            raise FocusV2Conflict("Focus session state changed or an active session exists.") from exc
        if code in ("22023", "23514"):
            raise FocusV2BadRequest("Invalid Focus V2 request.") from exc
        raise


def create_focus_v2(payload: CreateFocusV2Request) -> dict:
    data = _rpc("focus_v2_create_session", {
        "p_user_id": str(payload.user_id),
        "p_task_id": str(payload.task_id) if payload.task_id else None,
        "p_focus_minutes": payload.focus_minutes,
        "p_short_break_minutes": payload.short_break_minutes,
        "p_long_break_minutes": payload.long_break_minutes,
        "p_round_count": payload.round_count,
        "p_long_break_every": payload.long_break_every,
        "p_auto_start_breaks": payload.auto_start_breaks,
        "p_auto_start_focus": payload.auto_start_focus,
    })
    return {"session_id": data}


def transition_focus_v2(payload: TransitionFocusV2Request) -> dict:
    data = _rpc("focus_v2_transition", {
        "p_user_id": str(payload.user_id),
        "p_session_id": str(payload.session_id),
        "p_action": payload.action,
        "p_expected_segment_id": str(payload.expected_segment_id) if payload.expected_segment_id else None,
    })
    if not isinstance(data, dict):
        raise RuntimeError("Unexpected Focus V2 transition response")
    return data
