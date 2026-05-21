from fastapi import APIRouter, Depends

from app.schemas.native_task_risk_insight import (
    GenerateNativeTaskRiskInsightRequest,
    GenerateNativeTaskRiskInsightResponse,
)
from app.security.internal_api_key import verify_internal_api_key
from app.services.native_task_risk_insight_service import (
    generate_native_task_risk_insight,
)

router = APIRouter()


@router.post(
    "/generate",
    response_model=GenerateNativeTaskRiskInsightResponse,
    dependencies=[Depends(verify_internal_api_key)],
)
def generate_native_task_risk_insight_endpoint(
    payload: GenerateNativeTaskRiskInsightRequest,
):
    return generate_native_task_risk_insight(payload)