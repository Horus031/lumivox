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
    
    gemini_api_key: str | None = None
    gemini_insight_model: str = "gemini-2.5-flash"
    gemini_text_model: str = "gemini-2.5-flash"
    gemini_embedding_model: str = "text-embedding-004"

    llm_provider: str = "groq"
    groq_api_key: str | None = None
    groq_structured_models: str = (
        "openai/gpt-oss-20b,openai/gpt-oss-120b"
    )
    groq_chat_models: str = (
        "llama-3.1-8b-instant,llama-3.3-70b-versatile,openai/gpt-oss-20b"
    )
    llm_request_timeout_seconds: float = 30.0
    llm_max_attempts_per_model: int = 2

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
