from dataclasses import dataclass
from typing import Any

from app.core.rag_execution_context import RagProviderAttempt
from app.services.rag_conversation_store import RagConversationError, _call_rpc


@dataclass(frozen=True)
class SupabaseRagAttemptLedger:
    supabase: Any
    user_id: str
    lease_token: str
    max_attempts: int
    turn_id: str | None = None
    preparation_id: str | None = None
    revision: dict | None = None

    def begin(self, attempt_id: str, index: int, attempt: RagProviderAttempt, reserved_output: int | None) -> bool:
        result = _call_rpc(self.supabase, "rag_v2_begin_provider_attempt", {
            "p_attempt_id": attempt_id, "p_user_id": self.user_id, "p_turn_id": self.turn_id,
            "p_preparation_id": self.preparation_id, "p_lease_token": self.lease_token,
            "p_expected_revision": self.revision, "p_max_attempts": self.max_attempts,
            "p_attempt_index": index, "p_stage": attempt.stage, "p_provider": attempt.provider,
            "p_model_name": attempt.model, "p_estimated_prompt_tokens": attempt.estimated_prompt_tokens,
            "p_reserved_completion_tokens": reserved_output,
        })
        if result not in {"created", "existing"}:
            raise RagConversationError("RAG_PERSISTENCE_UNAVAILABLE", 503)
        return result == "created"

    def finish(self, attempt_id: str, attempt: RagProviderAttempt) -> None:
        result = _call_rpc(self.supabase, "rag_v2_finish_provider_attempt", {
            "p_attempt_id": attempt_id, "p_user_id": self.user_id, "p_status": attempt.outcome,
            "p_prompt_tokens": attempt.prompt_tokens, "p_completion_tokens": attempt.completion_tokens,
            "p_total_tokens": attempt.total_tokens, "p_latency_ms": attempt.latency_ms,
            "p_error_code": attempt.error_code,
        })
        if result is not True:
            raise RagConversationError("RAG_PERSISTENCE_UNAVAILABLE", 503)
