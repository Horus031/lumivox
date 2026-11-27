from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator


Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
Key = Annotated[str, StringConstraints(pattern=r"^[a-zA-Z0-9_-]+$")]
EvaluationCategory = Literal[
    "standalone", "referential_followup", "long_range_recall", "topic_switch",
    "worked_exercise", "handoff", "grounded_answer", "abstention",
]


class ExpectedOutcome(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    reference_answer: Text
    required_facts: list[Text] = Field(min_length=1)
    prohibited_claims: list[Text] = Field(default_factory=list)
    expected_arrays: list[list[int | float]] = Field(default_factory=list)
    relevant_evidence_keys: list[Key] = Field(default_factory=list)
    should_abstain: bool = False
    requires_citation: bool = False


class EvaluationCase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Key
    category: EvaluationCategory
    locale: Literal["en", "vi"]
    mode: Literal["general", "document"]
    difficulty: Literal["easy", "medium", "hard"]
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    history_fixture: Annotated[str, StringConstraints(pattern=r"^[a-zA-Z0-9_-]+\.json$")] | None = None
    document_keys: list[Key] = Field(default_factory=list)
    expected: ExpectedOutcome
    evidence_fixture: Literal["no_hits", "irrelevant_hits"] | None = None
    lifecycle_turns: list[Text] = Field(default_factory=list, max_length=23)

    @model_validator(mode="after")
    def check_scope(self):
        expected = self.expected
        if len(set(self.document_keys)) != len(self.document_keys):
            raise ValueError("Duplicate document key")
        if (self.mode == "document") != bool(self.document_keys):
            raise ValueError("Document mode requires document scope")
        if self.mode == "general" and (expected.requires_citation or expected.relevant_evidence_keys):
            raise ValueError("General mode cannot have document citation requirements")
        if expected.requires_citation and not expected.relevant_evidence_keys:
            raise ValueError("Citation rubric requires relevant evidence")
        if expected.should_abstain != (self.category == "abstention"):
            raise ValueError("Abstention requires a dedicated rubric and category")
        if expected.should_abstain != bool(self.evidence_fixture) or (
            expected.should_abstain and (self.mode != "document" or expected.requires_citation
                                         or not expected.prohibited_claims or expected.relevant_evidence_keys)
        ):
            raise ValueError("Abstention requires a document scope and a fabrication rubric")
        return self


Score = Literal[0, 1, 2] | None


class ReviewScore(BaseModel):
    model_config = ConfigDict(extra="forbid")

    correctness: Score
    completeness: Score
    context_continuity: Score
    grounding: Score
    language: Score
    clarity: Score
    overall_correct: bool | None
    review_notes: str = ""
    supported_citations: int = Field(default=0, ge=0)
    evaluated_citations: int = Field(default=0, ge=0)
    supported_claims: int = Field(default=0, ge=0)
    grounding_required_claims: int = Field(default=0, ge=0)
    unsupported_claims: int = Field(default=0, ge=0)
    abstained: bool | None = None
    adversarial_instruction_followed: bool | None = None
    unauthorized_information_exposed: bool | None = None
    credential_leaked: bool | None = None
    failure_codes: list[Literal[
        "memory_not_loaded", "memory_not_packed", "summary_information_loss", "handoff_information_loss",
        "retrieval_miss", "evidence_truncated", "topic_drift", "reasoning_error", "unsupported_claim",
        "citation_error", "incorrect_abstention", "security_failure", "provider_failure", "fixture_error",
    ]] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_counts(self):
        if self.supported_citations > self.evaluated_citations or self.supported_claims > self.grounding_required_claims:
            raise ValueError("Supported counts exceed evaluated counts")
        return self
