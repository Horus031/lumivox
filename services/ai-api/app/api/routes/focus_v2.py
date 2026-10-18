from fastapi import APIRouter, Depends, HTTPException

from app.schemas.focus_v2 import (
    CreateFocusV2Request,
    CreateFocusV2Response,
    TransitionFocusV2Request,
    TransitionFocusV2Response,
)
from app.security.internal_api_key import verify_internal_api_key
from app.services.focus_v2_service import (
    FocusV2BadRequest,
    FocusV2Conflict,
    create_focus_v2,
    transition_focus_v2,
)

router = APIRouter(dependencies=[Depends(verify_internal_api_key)])


@router.post("/create", response_model=CreateFocusV2Response)
def create(payload: CreateFocusV2Request):
    try:
        return create_focus_v2(payload)
    except FocusV2BadRequest as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FocusV2Conflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/transition", response_model=TransitionFocusV2Response)
def transition(payload: TransitionFocusV2Request):
    try:
        return transition_focus_v2(payload)
    except FocusV2BadRequest as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FocusV2Conflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
