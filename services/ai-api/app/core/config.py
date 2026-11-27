from typing import Literal

from pydantic import Field
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
        "openai/gpt-oss-20b,"
        "openai/gpt-oss-120b"
    )

    llm_request_timeout_seconds: float = 30.0
    llm_max_attempts_per_model: int = 2
    # ========================================================
    # RAG CONVERSATION V2
    # ========================================================

    rag_conversation_v2_enabled: bool = False
    rag_operation_recovery_enabled: bool = False
    rag_resource_control_enabled: bool = False
    rag_observability_enabled: bool = False
    rag_durable_accounting_enabled: bool = False
    rag_provider_throughput_enabled: bool = False
    rag_provider_quota_scope: str | None = None
    rag_provider_quotas_json: str = "{}"
    rag_context_quality_enabled: bool = False
    rag_privacy_filter_enabled: bool = False
    rag_context_isolation_enabled: bool = False
    rag_max_selected_documents: int = Field(default=20, ge=1, le=100)
    rag_history_candidate_turns: int = Field(default=12, ge=4, le=24)
    upstash_redis_rest_url: str | None = None
    upstash_redis_rest_token: str | None = None
    rag_resource_namespace: str = "local"
    rag_provider_max_concurrency: int = Field(default=4, ge=1, le=32)
    rag_provider_lease_seconds: int = Field(default=45, ge=15, le=180)
    rag_provider_admission_timeout_seconds: float = Field(default=1.0, gt=0, le=5)
    rag_provider_cooldown_seconds: int = Field(default=15, ge=1, le=120)
    rag_request_deadline_seconds: float = Field(default=25.0, ge=10, le=60)
    rag_answer_reserve_seconds: float = Field(default=10.0, gt=0, le=30)
    rag_completion_reserve_seconds: float = Field(default=3.0, gt=0, le=10)
    rag_max_provider_calls_per_ask: int = Field(default=4, ge=1, le=16)
    rag_max_provider_calls_per_handoff: int = Field(default=6, ge=1, le=16)

    rag_chat_models: str = (
        "openai/gpt-oss-20b,"
        "openai/gpt-oss-120b"
    )

    rag_new_chat_enabled: bool = False
    rag_handoff_enabled: bool = False
    rag_handoff_max_input_turns: int = Field(default=24, ge=1, le=100)
    rag_handoff_max_tokens: int = Field(default=500, ge=128, le=500)
    rag_handoff_deadline_seconds: float = Field(default=10.0, gt=0, le=20)
    rag_rolling_summary_enabled: bool = False
    rag_summary_start_turns: int = Field(default=6, ge=2, le=24)
    rag_summary_update_interval: int = Field(default=2, ge=1, le=8)
    rag_summary_max_batch_turns: int = Field(default=8, ge=1, le=24)
    rag_summary_completion_tokens: int = Field(default=800, ge=256, le=2048)
    rag_summary_request_timeout_seconds: float = Field(default=4.0, gt=0, le=10)
    rag_summary_deadline_seconds: float = Field(default=6.0, gt=0, le=15)
    rag_summary_models: str = (
        "openai/gpt-oss-20b,"
        "openai/gpt-oss-120b"
    )

    rag_max_prompt_tokens: int = Field(
        default=4000, ge=512, le=32768
    )

    rag_max_completion_tokens: int = Field(
        default=1200, ge=256, le=8192
    )

    rag_max_summary_tokens: int = Field(
        default=500, ge=128, le=2048
    )

    rag_recent_turns: int = Field(
        default=4, ge=1, le=12
    )

    rag_soft_turn_limit: int = Field(
        default=18, ge=1, le=100
    )

    rag_hard_turn_limit: int = Field(
        default=24, ge=2, le=120
    )

    rag_request_timeout_seconds: float = Field(
        default=8.0, gt=0, le=30
    )

    rag_generation_deadline_seconds: float = Field(
        default=18.0, gt=0, le=60
    )

    rag_max_attempts_per_model: int = Field(
        default=1, ge=1, le=2
    )

    rag_reasoning_effort: Literal[
        "low", "medium", "high"
    ] = "low"


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
