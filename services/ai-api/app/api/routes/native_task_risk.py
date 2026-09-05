from __future__ import annotations

from fastapi import APIRouter

from app.schemas.native_task_risk import (
    NativeTaskRiskPredictRequest,
    NativeTaskRiskPredictResponse,
)
from app.services.native_task_risk_service import predict_native_task_risk


router = APIRouter()


@router.post("/predict", response_model=NativeTaskRiskPredictResponse)
def predict_task_risk(
    request: NativeTaskRiskPredictRequest,
) -> NativeTaskRiskPredictResponse:
    return predict_native_task_risk(request)