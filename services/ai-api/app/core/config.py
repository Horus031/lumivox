from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    app_name: str = "Lumivox AI API"
    app_port: int = 8000

    supabase_url: str
    supabase_secret_key: str

    ai_internal_api_key: str

    deadline_risk_model_path: str = (
        "ml/artifacts/deadline-risk/random_forest.joblib"
    )
    deadline_risk_model_key: str = "deadline_risk_classifier"
    deadline_risk_model_version: str = "rf-oulad-v1"

    # ========================================================
    # EXISTING / SHARED GEMINI
    # ========================================================

    gemini_api_key: str | None = None
    gemini_insight_model: str = "gemini-2.5-flash"
    gemini_text_model: str = "gemini-2.5-flash"

    # Keep the shared RAG corpus compatible with production.
    #
    # Production chunks currently use gemini-embedding-001.
    # Do NOT switch this to gemini-embedding-2 without
    # re-embedding the stored corpus.
    gemini_embedding_model: str = "gemini-embedding-001"

    # ========================================================
    # EXISTING / SHARED LLM
    # ========================================================

    llm_provider: str = "groq"
    groq_api_key: str | None = None

    groq_structured_models: str = (
        "openai/gpt-oss-20b,"
        "openai/gpt-oss-120b"
    )

    groq_chat_models: str = (
        "llama-3.1-8b-instant,"
        "llama-3.3-70b-versatile,"
        "openai/gpt-oss-20b"
    )

    llm_request_timeout_seconds: float = 30.0
    llm_max_attempts_per_model: int = 2

    # ========================================================
    # TASK REVIEW AI
    #
    # IMPORTANT:
    # These keys are intentionally separate from all other AI
    # functionality in Lumivox.
    # ========================================================

    review_groq_api_key: str | None = None
    review_gemini_api_key: str | None = None

    review_llm_provider_chain: str = "groq,google"

    review_groq_structured_models: str = (
        "openai/gpt-oss-20b,"
        "openai/gpt-oss-120b"
    )

    review_gemini_model: str = "gemini-3.8-flash"

    review_request_timeout_seconds: float = 45.0
    review_max_attempts_per_model: int = 2

    review_default_pass_threshold: int = 70
    review_top_k_chunks: int = 8

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )
    
    review_generation_stale_seconds: int = 900


settings = Settings()