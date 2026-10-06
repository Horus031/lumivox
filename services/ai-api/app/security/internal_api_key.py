from secrets import (
    compare_digest,
)

from fastapi import (
    Header,
    HTTPException,
    status,
)

from app.core.config import (
    settings,
)


def verify_internal_api_key(
    x_lumivox_internal_key:
        str | None
        = Header(
            default=None
        ),
) -> None:
    supplied = (
        x_lumivox_internal_key
        or ""
    )

    expected = (
        settings
        .ai_internal_api_key
        or ""
    )

    if (
        not supplied
        or not expected
        or not compare_digest(
            supplied,
            expected,
        )
    ):
        raise HTTPException(
            status_code=(
                status
                .HTTP_401_UNAUTHORIZED
            ),
            detail=(
                "Invalid internal API key."
            ),
        )