from fastapi import APIRouter, Depends

from app.schemas.engagement_retention import (
    RecalculateEngagementRequest,
    RecalculateEngagementResponse,
)
from app.security.internal_api_key import verify_internal_api_key
from app.services.engagement_retention_service import (
    recalculate_engagement,
)

router = APIRouter()


@router.post(
    "/recalculate",
    response_model=RecalculateEngagementResponse,
    dependencies=[Depends(verify_internal_api_key)],
)
def recalculate_engagement_endpoint(
    payload: RecalculateEngagementRequest,
):
    return recalculate_engagement(payload)