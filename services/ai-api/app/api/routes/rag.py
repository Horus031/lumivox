from fastapi import APIRouter, Depends, HTTPException
import logging
from uuid import UUID

from app.core.config import settings
from app.clients.supabase_client import get_supabase_client

from app.security.internal_api_key import verify_internal_api_key
from app.schemas.rag_document_processing import (
    ProcessLearningDocumentRequest,
    ProcessLearningDocumentResponse,
    RagAskRequest,
    RagAskResponse
)
from app.services.rag_document_processing_service import (
    process_learning_document,
)

from app.services.rag_chat_service import ask_rag_question

from app.services.rag_conversation_service import (
    ask_rag_conversation_question,
    restore_rag_conversation,
)

from app.services.rag_conversation_store import (
    RagConversationError,
    list_conversations,
    load_pending_new_chat,
    load_history_detail,
)
from app.services.rag_new_chat_service import start_new_conversation
from app.services.rag_operation_recovery_service import reconcile_operation
from app.schemas.rag_operation_recovery import RagOperationStatusRequest, RagOperationStatusResponse
from app.schemas.rag_conversation_handoff import (
    RagHistoryDetailRequest, RagHistoryDetailResponse, RagHistoryRequest, RagHistoryResponse,
    RagNewChatRequest, RagNewChatResponse,
)

from app.schemas.rag_document_processing import (
    RagConversationRestoreRequest,
    RagConversationRestoreResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/rag",
    tags=["rag"],
)


@router.post(
    "/documents/process",
    response_model=ProcessLearningDocumentResponse,
)
def process_document(
    payload: ProcessLearningDocumentRequest,
    _: None = Depends(verify_internal_api_key),
):
    try:
        result = process_learning_document(
            document_id=payload.document_id,
            user_id=payload.user_id,
        )

        return ProcessLearningDocumentResponse(**result)

    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error

    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error



@router.post(
    "/chat/ask",
    response_model=RagAskResponse,
)
def ask_question(
    payload: RagAskRequest,
    _: None = Depends(
        verify_internal_api_key
    ),
):
    try:
        if payload.conversation_protocol == "v2" and not settings.rag_conversation_v2_enabled:
            raise HTTPException(409, detail={"code": "RAG_V2_DISABLED"})
        if payload.conversation_protocol == "legacy" and settings.rag_conversation_v2_enabled:
            raise HTTPException(409, detail={"code": "RAG_PROTOCOL_MISMATCH"})
        if settings.rag_conversation_v2_enabled:
            if payload.client_request_id is None:
                raise RagConversationError(
                    "RAG_REQUEST_ID_REQUIRED",
                    400,
                )

            try:
                user_id = str(UUID(payload.user_id))

                session_id = (
                    str(UUID(payload.session_id))
                    if payload.session_id
                    else None
                )

                focus_session_id = (
                    str(UUID(payload.focus_session_id))
                    if payload.focus_session_id
                    else None
                )

                document_ids = [
                    str(UUID(value))
                    for value
                    in payload.selected_document_ids
                ]

            except ValueError:
                raise RagConversationError(
                    "RAG_INVALID_REQUEST",
                    400,
                ) from None

            result = ask_rag_conversation_question(
                user_id=user_id,
                question=payload.question,
                selected_document_ids=document_ids,
                focus_session_id=focus_session_id,
                session_id=session_id,
                client_request_id=str(
                    payload.client_request_id
                ),
                top_k=payload.top_k,
                prompt_variant=payload.prompt_variant,
                preferred_locale=payload.preferred_locale,
            )
            result = {
                **result,
                "soft_turn_limit": settings.rag_soft_turn_limit,
                "hard_turn_limit": settings.rag_hard_turn_limit,
            }

        else:
            result = ask_rag_question(
                user_id=payload.user_id,
                question=payload.question,
                selected_document_ids=(
                    payload.selected_document_ids
                ),
                focus_session_id=payload.focus_session_id,
                session_id=payload.session_id,
                top_k=payload.top_k,
                prompt_variant=payload.prompt_variant,
                preferred_locale=payload.preferred_locale,
            )

        return RagAskResponse(**result)

    except RagConversationError as error:
        details = {"code": error.code}
        if error.session_id is not None:
            details["session_id"] = error.session_id
        if error.outcome is not None:
            details["outcome"] = error.outcome
        raise HTTPException(error.status_code, detail=details if len(details) > 1 else error.code) from None

    except HTTPException:
        raise

    except Exception:
        logger.error(
            "Unexpected RAG ask failure"
        )

        raise HTTPException(
            status_code=500,
            detail="RAG_INTERNAL_ERROR",
        ) from None


@router.post(
    "/chat/restore",
    response_model=RagConversationRestoreResponse,
)
def restore_conversation(
    payload: RagConversationRestoreRequest,
    _: None = Depends(
        verify_internal_api_key
    ),
):
    if not settings.rag_conversation_v2_enabled:
        return RagConversationRestoreResponse(
            enabled=False, recovery_enabled=settings.rag_operation_recovery_enabled,
        )

    try:
        user_id, focus_id = str(payload.user_id), str(payload.focus_session_id)
        try:
            result = restore_rag_conversation(user_id=user_id, focus_session_id=focus_id)
        except RagConversationError as error:
            if error.code != "RAG_DOCUMENT_ACCESS_DENIED" or not settings.rag_new_chat_enabled:
                raise
            history = list_conversations(get_supabase_client(), user_id=user_id, focus_session_id=focus_id)
            active_id = history.get("active_session_id")
            active = next((item for item in history["conversations"] if item["id"] == active_id), None)
            if active_id and (active is None or not active["content_available"]):
                result = {"enabled": True, "session_id": active_id, "content_available": False}
                if settings.rag_operation_recovery_enabled:
                    result["pending_operation"] = load_pending_new_chat(
                        get_supabase_client(), user_id=user_id, focus_session_id=focus_id,
                    )
            else:
                result = restore_rag_conversation(user_id=user_id, focus_session_id=focus_id)

        return RagConversationRestoreResponse(
            **{
                **result,
                "recovery_enabled": settings.rag_operation_recovery_enabled,
                "pending_operation": result.get("pending_operation") if settings.rag_operation_recovery_enabled else None,
                "soft_turn_limit": settings.rag_soft_turn_limit,
                "hard_turn_limit": settings.rag_hard_turn_limit,
                "new_chat_enabled": settings.rag_new_chat_enabled,
                "handoff_enabled": settings.rag_new_chat_enabled and settings.rag_handoff_enabled,
                "has_handoff": bool(result.get("has_handoff")) and settings.rag_handoff_enabled
                and settings.rag_new_chat_enabled,
            }
        )

    except RagConversationError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail=error.code,
        ) from None

    except Exception:
        raise HTTPException(
            status_code=503,
            detail="RAG_PERSISTENCE_UNAVAILABLE",
        ) from None


@router.post("/chat/new", response_model=RagNewChatResponse)
def new_chat(payload: RagNewChatRequest, _: None = Depends(verify_internal_api_key)):
    try:
        return start_new_conversation(payload)
    except RagConversationError as error:
        detail = {"code": error.code}
        if error.outcome is not None:
            detail["outcome"] = error.outcome
        raise HTTPException(error.status_code, detail=detail) from None
    except Exception:
        raise HTTPException(503, detail={"code": "RAG_PERSISTENCE_UNAVAILABLE"}) from None


@router.post("/chat/operation-status", response_model=RagOperationStatusResponse)
def operation_status(payload: RagOperationStatusRequest, _: None = Depends(verify_internal_api_key)):
    try:
        return reconcile_operation(payload)
    except RagConversationError as error:
        raise HTTPException(error.status_code, detail={"code": error.code}) from None
    except Exception:
        raise HTTPException(503, detail={"code": "RAG_PERSISTENCE_UNAVAILABLE"}) from None


@router.post("/chat/history", response_model=RagHistoryResponse)
def conversation_history(payload: RagHistoryRequest, _: None = Depends(verify_internal_api_key)):
    if not settings.rag_conversation_v2_enabled or not settings.rag_new_chat_enabled:
        raise HTTPException(409, detail={"code": "RAG_NEW_CHAT_DISABLED"})
    try:
        cursor = payload.cursor
        return RagHistoryResponse.model_validate(list_conversations(
            get_supabase_client(), user_id=str(payload.user_id), focus_session_id=str(payload.focus_session_id),
            limit=payload.limit, cursor_created_at=cursor.created_at.isoformat() if cursor else None,
            cursor_id=str(cursor.id) if cursor else None,
        ))
    except RagConversationError as error:
        raise HTTPException(error.status_code, detail={"code": error.code}) from None
    except Exception:
        raise HTTPException(503, detail={"code": "RAG_PERSISTENCE_UNAVAILABLE"}) from None


@router.post("/chat/history/detail", response_model=RagHistoryDetailResponse)
def history_detail(payload: RagHistoryDetailRequest, _: None = Depends(verify_internal_api_key)):
    if not settings.rag_conversation_v2_enabled or not settings.rag_new_chat_enabled:
        raise HTTPException(409, detail={"code": "RAG_NEW_CHAT_DISABLED"})
    try:
        return RagHistoryDetailResponse.model_validate(load_history_detail(
            get_supabase_client(), user_id=str(payload.user_id),
            focus_session_id=str(payload.focus_session_id), session_id=str(payload.session_id),
        ))
    except RagConversationError as error:
        raise HTTPException(error.status_code, detail={"code": error.code}) from None
    except Exception:
        raise HTTPException(503, detail={"code": "RAG_PERSISTENCE_UNAVAILABLE"}) from None
