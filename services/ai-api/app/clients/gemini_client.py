from google import genai

from app.core.config import settings


def get_gemini_client() -> genai.Client:
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY must be configured.")

    return genai.Client(
        api_key=settings.gemini_api_key,
    )
