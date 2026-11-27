from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


RagSummaryMethod = Literal["llm", "extractive"]
SUMMARY_TEXT_FIELDS = ("main_topic", "learning_objective", "continuation_hint")
SUMMARY_LIST_FIELDS = (
    "covered_concepts",
    "important_user_context",
    "unresolved_questions",
    "document_references",
    "uncertainties",
)


class RagConversationSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    main_topic: str = Field(max_length=240)
    learning_objective: str = Field(max_length=400)
    covered_concepts: list[str] = Field(max_length=12)
    important_user_context: list[str] = Field(max_length=6)
    unresolved_questions: list[str] = Field(max_length=8)
    document_references: list[str] = Field(max_length=12)
    uncertainties: list[str] = Field(max_length=8)
    continuation_hint: str = Field(max_length=400)


class RagStoredSummary(BaseModel):
    id: str
    version: int = Field(gt=0)
    schema_version: Literal[1]
    covered_turn_index: int = Field(gt=0)
    covered_turn_count: int = Field(gt=0)
    summary: RagConversationSummary
    generation_method: RagSummaryMethod
    model_name: str | None = None
    token_count: int | None = Field(default=None, gt=0)


SUMMARY_RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "rag_conversation_summary",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                **{field: {"type": "string"} for field in SUMMARY_TEXT_FIELDS},
                **{
                    field: {"type": "array", "items": {"type": "string"}}
                    for field in SUMMARY_LIST_FIELDS
                },
            },
            "required": [*SUMMARY_TEXT_FIELDS, *SUMMARY_LIST_FIELDS],
            "additionalProperties": False,
        },
    },
}
