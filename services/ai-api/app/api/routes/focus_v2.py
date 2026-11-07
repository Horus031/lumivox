from fastapi import APIRouter, Depends, HTTPException
from postgrest.exceptions import APIError

from app.schemas.focus_v2 import (
    CreateFocusV2Request,
    CreateFocusV2Response,
    CreateStudyFocusRequest,
    CreateStudyFocusResponse,
    TransitionFocusV2Request,
    TransitionFocusV2Response,
)
from app.security.internal_api_key import verify_internal_api_key
from app.services.focus_v2_service import (
    FocusV2BadRequest,
    FocusV2Conflict,
    create_focus_v2,
    create_study_focus,
    transition_focus_v2,
)

router = APIRouter(dependencies=[Depends(verify_internal_api_key)])

STUDY_FOCUS_ERRORS = {
    "22023": (400, "invalidInput"),
    "PT403": (403, "notAuthorized"),
    "PT422": (410, "ineligibleSession"),
    "PT409": (409, "requestConflict"),
    "PT423": (423, "activeFocusConflict"),
    "55P03": (429, "retryableConflict"),
    "40001": (429, "retryableConflict"),
    "40P01": (429, "retryableConflict"),
}


@router.post("/create", response_model=CreateFocusV2Response)
def create(payload: CreateFocusV2Request):
    try:
        return create_focus_v2(payload)
    except FocusV2BadRequest as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FocusV2Conflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/create-from-study-session", response_model=CreateStudyFocusResponse)
def create_from_study_session(payload: CreateStudyFocusRequest):
    try:
        return create_study_focus(payload)
    except APIError as exc:
        error = STUDY_FOCUS_ERRORS.get(exc.code)
        if error is None:
            raise
        status, detail = error
        raise HTTPException(status_code=status, detail=detail) from exc


@router.post("/transition", response_model=TransitionFocusV2Response)
def transition(payload: TransitionFocusV2Request):
    try:
        return transition_focus_v2(payload)
    except FocusV2BadRequest as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FocusV2Conflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
