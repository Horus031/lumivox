from fastapi import APIRouter, Depends, HTTPException
import logging
from uuid import UUID

from app.core.config import settings

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
        raise HTTPException(
            status_code=error.status_code,
            detail=(
                {"code": error.code, "session_id": error.session_id}
                if error.session_id is not None
                else error.code
            ),
        ) from None

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
            enabled=False
        )

    try:
        result = restore_rag_conversation(
            user_id=str(payload.user_id),
            focus_session_id=str(
                payload.focus_session_id
            ),
        )

        return RagConversationRestoreResponse(
            **result
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
