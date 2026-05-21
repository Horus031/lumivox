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
    
    gemini_api_key: str
    gemini_insight_model: str = "gemini-2.5-flash"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()