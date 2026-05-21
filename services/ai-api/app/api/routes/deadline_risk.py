from fastapi import APIRouter, Depends, Request

from app.schemas.deadline_risk import (
    DeadlineRiskPredictionRequest,
    DeadlineRiskPredictionResponse,
)
from app.security.internal_api_key import verify_internal_api_key
from app.services.deadline_risk_service import predict_deadline_risk

router = APIRouter()


@router.post(
    "/predict",
    response_model=DeadlineRiskPredictionResponse,
    dependencies=[Depends(verify_internal_api_key)],
)
def predict_deadline_risk_endpoint(
    payload: DeadlineRiskPredictionRequest,
    request: Request,
):
    runtime = request.app.state.deadline_risk_runtime

    return predict_deadline_risk(
        runtime=runtime,
        payload=payload,
    )