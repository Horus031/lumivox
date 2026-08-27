from fastapi import APIRouter, Depends, HTTPException

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
    _: None = Depends(verify_internal_api_key),
):
    try:
        result = ask_rag_question(
            user_id=payload.user_id,
            question=payload.question,
            selected_document_ids=payload.selected_document_ids,
            focus_session_id=payload.focus_session_id,
            session_id=payload.session_id,
            top_k=payload.top_k,
            prompt_variant=payload.prompt_variant,
            preferred_locale=payload.preferred_locale
        )

        return RagAskResponse(**result)

    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error