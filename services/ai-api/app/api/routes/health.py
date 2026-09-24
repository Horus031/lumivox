import os

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter()


@router.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": settings.app_name,
        "environment": settings.app_env,
        "revision": (
            os.getenv("RENDER_GIT_COMMIT")
            or os.getenv("GIT_COMMIT_SHA")
        ),
    }
