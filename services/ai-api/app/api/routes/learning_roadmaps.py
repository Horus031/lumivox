from __future__ import annotations

from fastapi import APIRouter

from app.schemas.learning_roadmap import (
    LearningRoadmapGenerateRequest,
    LearningRoadmapGenerateResponse,
)
from app.services.learning_roadmap_service import generate_learning_roadmap


router = APIRouter()


@router.post("/generate", response_model=LearningRoadmapGenerateResponse)
def generate_roadmap(
    request: LearningRoadmapGenerateRequest,
) -> LearningRoadmapGenerateResponse:
    return generate_learning_roadmap(request)