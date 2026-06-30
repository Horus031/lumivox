from fastapi import APIRouter, Depends, HTTPException

from app.security.internal_api_key import verify_internal_api_key
from app.schemas.rag_document_processing import (
    ProcessLearningDocumentRequest,
    ProcessLearningDocumentResponse,
)
from app.services.rag_document_processing_service import (
    process_learning_document,
)

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