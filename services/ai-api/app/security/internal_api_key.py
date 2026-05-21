from fastapi import Header, HTTPException, status

from app.core.config import settings


def verify_internal_api_key(
    x_lumivox_internal_key: str | None = Header(default=None),
) -> None:
    if x_lumivox_internal_key != settings.ai_internal_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal API key.",
        )