from fastapi import APIRouter, Depends

from app.schemas.native_task_risk import (
    GenerateNativeTaskRiskScanRequest,
    GenerateNativeTaskRiskScanResponse,
)
from app.security.internal_api_key import verify_internal_api_key
from app.services.native_task_risk_service import (
    generate_native_task_risk_scan,
)

router = APIRouter()


@router.post(
    "/scan",
    response_model=GenerateNativeTaskRiskScanResponse,
    dependencies=[Depends(verify_internal_api_key)],
)
def generate_native_task_risk_scan_endpoint(
    payload: GenerateNativeTaskRiskScanRequest,
):
    return generate_native_task_risk_scan(payload)