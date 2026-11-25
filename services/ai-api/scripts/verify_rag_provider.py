
from __future__ import annotations

import json
from dataclasses import asdict

from groq import Groq

from app.clients.rag_llm_client import (
    RagChatMessage,
    generate_rag_chat,
)
from app.core.config import settings
from app.core.rag_model_registry import (
    parse_rag_model_chain,
    validate_rag_configuration,
)


def main() -> None:
    validate_rag_configuration()

    if not settings.groq_api_key:
        raise RuntimeError(
            "GROQ_API_KEY is required."
        )

    client = Groq(
        api_key=settings.groq_api_key,
        timeout=15,
        max_retries=0,
    )

    available_models = {
        model.id
        for model in client.models.list().data
    }

    chat_models = parse_rag_model_chain(
        settings.rag_chat_models
    )

    summary_models = parse_rag_model_chain(
        settings.rag_summary_models
    )

    expected_models = list(
        dict.fromkeys(
            chat_models + summary_models
        )
    )

    missing_models = [
        model
        for model in expected_models
        if model not in available_models
    ]

    if missing_models:
        raise RuntimeError(
            "Configured RAG models are unavailable: "
            + ", ".join(missing_models)
        )

    messages: list[RagChatMessage] = [
        {
            "role": "system",
            "content": (
                "You are Lumivox Study Assistant. "
                "Respond concisely in English."
            ),
        },
        {
            "role": "user",
            "content": (
                "For this conversation, "
                "let alpha equal 17."
            ),
        },
        {
            "role": "assistant",
            "content": "Understood. Alpha equals 17.",
        },
        {
            "role": "user",
            "content": (
                "What is alpha plus five? "
                "Return only the integer."
            ),
        },
    ]

    original_chain = settings.rag_chat_models

    evidence = []

    try:
        for model in expected_models:
            settings.rag_chat_models = model

            result = generate_rag_chat(messages)

            if result.text.strip() != "22":
                raise RuntimeError(
                    f"Conversation context smoke "
                    f"test failed for {model}."
                )

            evidence.append({
                "model": result.model,
                "provider": result.provider,
                "latency_ms": result.latency_ms,
                "attempts": result.attempts,
                "finish_reason": result.finish_reason,
                "usage": asdict(result.usage),
                "conversation_context_test": "PASS",
            })

    finally:
        settings.rag_chat_models = original_chain

    print(
        json.dumps(
            {
                "status": "PASS",
                "configured_models": expected_models,
                "results": evidence,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()