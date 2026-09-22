from __future__ import annotations
import os
from fastapi import APIRouter, Header, HTTPException

from fastapi import APIRouter

from app.schemas.native_task_risk import (
    NativeTaskRiskBatchPredictRequest,
    NativeTaskRiskBatchPredictResponse,
    NativeTaskRiskPredictRequest,
    NativeTaskRiskPredictResponse,
    NativeTaskRiskCronRefreshRequest,
    NativeTaskRiskCronRefreshResponse,
)
from app.services.native_task_risk_service import (
    predict_native_task_risk,
    predict_native_task_risk_batch,
    refresh_native_task_risk_for_cron,
)


router = APIRouter()


@router.post("/predict", response_model=NativeTaskRiskPredictResponse)
def predict_task_risk(
    request: NativeTaskRiskPredictRequest,
) -> NativeTaskRiskPredictResponse:
    return predict_native_task_risk(request)

@router.post("/batch-predict", response_model=NativeTaskRiskBatchPredictResponse)
def predict_task_risk_batch(
    request: NativeTaskRiskBatchPredictRequest,
) -> NativeTaskRiskBatchPredictResponse:
    return predict_native_task_risk_batch(request)

@router.post("/cron-refresh", response_model=NativeTaskRiskCronRefreshResponse)
def cron_refresh_task_risk(
    request: NativeTaskRiskCronRefreshRequest,
    x_cron_secret: str | None = Header(default=None),
) -> NativeTaskRiskCronRefreshResponse:
    expected_secret = os.getenv("NATIVE_TASK_RISK_CRON_SECRET")

    if not expected_secret or x_cron_secret != expected_secret:
        raise HTTPException(status_code=401, detail="Unauthorized cron request.")

    return refresh_native_task_risk_for_cron(request)