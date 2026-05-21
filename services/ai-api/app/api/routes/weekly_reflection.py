from fastapi import APIRouter, Depends

from app.schemas.weekly_reflection import (
    GenerateWeeklyReflectionRequest,
    GenerateWeeklyReflectionResponse,
)
from app.security.internal_api_key import verify_internal_api_key
from app.services.weekly_reflection_service import (
    generate_weekly_reflection,
)

router = APIRouter()


@router.post(
    "/generate",
    response_model=GenerateWeeklyReflectionResponse,
    dependencies=[Depends(verify_internal_api_key)],
)
def generate_weekly_reflection_endpoint(
    payload: GenerateWeeklyReflectionRequest,
):
    return generate_weekly_reflection(payload)