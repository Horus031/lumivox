from pydantic import ValidationError

from app.clients.supabase_client import get_supabase_client
from app.core.config import settings
from app.schemas.rag_operation_recovery import RagOperationStatusRequest, RagOperationStatusResponse
from app.services.rag_conversation_store import RagConversationError, load_operation_status, recover_expired_turn


def reconcile_operation(request: RagOperationStatusRequest) -> RagOperationStatusResponse:
    if not settings.rag_operation_recovery_enabled:
        raise RagConversationError("RAG_RECOVERY_DISABLED", 409)

    supabase = get_supabase_client()
    args = {
        "user_id": str(request.user_id),
        "focus_session_id": str(request.focus_session_id),
        "client_request_id": str(request.client_request_id),
    }
    result = (
        recover_expired_turn(supabase, **args)
        if request.recover_expired
        else load_operation_status(supabase, **args, operation=request.operation)
    )
    try:
        response = RagOperationStatusResponse.model_validate(result)
    except ValidationError:
        raise RagConversationError("RAG_PERSISTENCE_UNAVAILABLE", 503) from None
    if response.operation != request.operation:
        raise RagConversationError("RAG_PERSISTENCE_UNAVAILABLE", 503)
    return response
