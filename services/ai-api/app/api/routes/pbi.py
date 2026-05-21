from fastapi import APIRouter, Depends

from app.schemas.pbi import (
    GeneratePBISnapshotRequest,
    GeneratePBISnapshotResponse,
)
from app.security.internal_api_key import verify_internal_api_key
from app.services.pbi_service import generate_pbi_snapshot

router = APIRouter()


@router.post(
    "/generate-snapshot",
    response_model=GeneratePBISnapshotResponse,
    dependencies=[Depends(verify_internal_api_key)],
)
def generate_snapshot(payload: GeneratePBISnapshotRequest):
    return generate_pbi_snapshot(payload.user_id)