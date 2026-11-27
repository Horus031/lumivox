from contextlib import contextmanager
from dataclasses import dataclass

from app.core.config import settings
from app.schemas.rag_conversation_context import RagConversationContext


@dataclass(frozen=True)
class EvaluationVariant:
    name: str
    use_history: bool
    use_summary: bool
    use_handoff: bool
    adaptive: bool


VARIANTS = {
    "A": EvaluationVariant("stateless", False, False, False, False),
    "B": EvaluationVariant("recent", True, False, False, False),
    "C": EvaluationVariant("rolling", True, True, False, False),
    "D": EvaluationVariant("full_adaptive", True, True, True, True),
}


@contextmanager
def configure_variant(variant: EvaluationVariant):
    # Run each variant in an evaluation CLI process, never in a running API worker.
    overrides = {
        "rag_conversation_v2_enabled": True,
        "rag_context_quality_enabled": variant.adaptive,
        "rag_rolling_summary_enabled": variant.use_summary,
        "rag_handoff_enabled": variant.use_handoff,
        "rag_new_chat_enabled": True,
        "rag_privacy_filter_enabled": True,
        "rag_context_isolation_enabled": True,
        "rag_resource_control_enabled": True,
        "rag_operation_recovery_enabled": True,
    }
    previous = {key: getattr(settings, key) for key in overrides}
    try:
        for key, value in overrides.items():
            setattr(settings, key, value)
        yield
    finally:
        for key, value in previous.items():
            setattr(settings, key, value)


def project_context(original: RagConversationContext, variant: EvaluationVariant) -> RagConversationContext:
    window = settings.rag_history_candidate_turns if variant.adaptive else settings.rag_recent_turns
    recent = sorted(original.recent_turns, key=lambda turn: turn.turn_index)[-window:] if variant.use_history else []
    return original.model_copy(update={
        "recent_turns": recent,
        "summary": original.summary if variant.use_summary else None,
        "handoff": original.handoff if variant.use_handoff else None,
    })
