import os

from fastapi import APIRouter, Request

from app.core.config import settings

router = APIRouter()


@router.get("/health")
def health_check(request: Request):
    legacy_runtime = getattr(
        request.app.state,
        "deadline_risk_runtime",
        None,
    )
    native_model = getattr(
        request.app.state,
        "native_task_risk_model",
        None,
    )

    return {
        "status": "ok",
        "service": settings.app_name,
        "environment": settings.app_env,
        "revision": (
            os.getenv("RENDER_GIT_COMMIT")
            or os.getenv("GIT_COMMIT_SHA")
        ),
        "models": {
            "legacy_deadline_risk": (
                "ready" if legacy_runtime is not None else "degraded"
            ),
            "native_task_risk": native_model,
        },
    }
