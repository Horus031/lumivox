from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)

from app.schemas.task_review import (
    GenerateTaskReviewRequest,
    GetLatestTaskReviewRequest,
    GetLatestTaskReviewResponse,
    SubmitTaskReviewRequest,
    TaskReviewAttemptResponse,
)

from app.security.internal_api_key import (
    verify_internal_api_key,
)

from app.services.task_review_service import (
    TaskReviewConflictError,
    generate_task_review,
    get_latest_task_review,
    submit_task_review,
)


router = APIRouter(
    dependencies=[
        Depends(
            verify_internal_api_key
        )
    ]
)


@router.post(
    "/generate",
    response_model=(
        TaskReviewAttemptResponse
    ),
)
def generate_task_review_endpoint(
    payload: GenerateTaskReviewRequest,
):
    try:
        return generate_task_review(
            payload
        )

    except PermissionError as error:
        raise HTTPException(
            status_code=403,
            detail=str(error),
        ) from error

    except TaskReviewConflictError as error:
        raise HTTPException(
            status_code=409,
            detail=str(error),
        ) from error

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error),
        ) from error

@router.post(
    "/submit",
    response_model=(
        TaskReviewAttemptResponse
    ),
)
def submit_task_review_endpoint(
    payload: SubmitTaskReviewRequest,
):
    try:
        return submit_task_review(
            payload
        )

    except PermissionError as error:
        raise HTTPException(
            status_code=403,
            detail=str(error),
        ) from error

    except TaskReviewConflictError as error:
        raise HTTPException(
            status_code=409,
            detail=str(error),
        ) from error

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error),
        ) from error


@router.post(
    "/latest",
    response_model=(
        GetLatestTaskReviewResponse
    ),
)
def latest_task_review_endpoint(
    payload: GetLatestTaskReviewRequest,
):
    try:
        return get_latest_task_review(
            user_id=(
                payload.user_id
            ),
            task_id=(
                payload.task_id
            ),
        )

    except PermissionError as error:
        raise HTTPException(
            status_code=403,
            detail=str(error),
        ) from error

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error),
        ) from error