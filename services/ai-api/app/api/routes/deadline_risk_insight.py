from fastapi import APIRouter, Depends

from app.schemas.deadline_risk_insight import (
    GenerateDeadlineRiskInsightRequest,
    GenerateDeadlineRiskInsightResponse,
)
from app.security.internal_api_key import verify_internal_api_key
from app.services.deadline_risk_insight_service import (
    generate_deadline_risk_insight,
)

router = APIRouter()


@router.post(
    "/generate",
    response_model=GenerateDeadlineRiskInsightResponse,
    dependencies=[Depends(verify_internal_api_key)],
)
def generate_deadline_risk_insight_endpoint(
    payload: GenerateDeadlineRiskInsightRequest,
):
    return generate_deadline_risk_insight(payload)