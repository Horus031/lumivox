import hashlib
import json
from collections import Counter
from pathlib import Path

from app.schemas.rag_conversation_context import RagConversationContext
from app.schemas.rag_evaluation import EvaluationCase


PROTOCOL = Path(__file__).resolve().parents[3] / "docs/rag-conversation-v2/phase-6e-evaluation-protocol.md"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def load_frozen_dataset(dataset: Path):
    root = dataset.resolve().parent
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    protocol_digest = hashlib.sha256(PROTOCOL.read_text(encoding="utf-8").encode()).hexdigest()
    if protocol_digest != manifest["protocol_sha256"]:
        raise ValueError("Frozen evaluation protocol failed digest verification")
    files = manifest["sha256"]
    if dataset.name not in files:
        raise ValueError("Dataset was not frozen in the manifest")
    for name, digest in files.items():
        file = (root / name).resolve()
        if not file.is_relative_to(root) or not file.is_file() or sha256(file) != digest:
            raise ValueError(f"Frozen artifact failed digest verification: {name}")
    documents = manifest["documents"]
    evidence_keys = set()
    for document in documents.values():
        if document["path"] not in files:
            raise ValueError("Missing frozen document")
        content = (root / document["path"]).read_text(encoding="utf-8")
        for key, passage in document["evidence"].items():
            if key in evidence_keys or not passage.strip() or passage not in content:
                raise ValueError(f"Invalid evidence passage: {key}")
            evidence_keys.add(key)
    cases = [EvaluationCase.model_validate(item) for item in read_jsonl(dataset)]
    if not cases or len({case.id for case in cases}) != len(cases):
        raise ValueError("Empty dataset or duplicate case ID")
    for case in cases:
        if not set(case.document_keys) <= documents.keys():
            raise ValueError(f"Unknown document in {case.id}")
        scoped = {key for name in case.document_keys for key in documents[name]["evidence"]}
        if not set(case.expected.relevant_evidence_keys) <= scoped:
            raise ValueError(f"Evidence outside scope in {case.id}")
        if case.history_fixture:
            path = f"histories/{case.history_fixture}"
            if path not in files:
                raise ValueError(f"Unknown history in {case.id}")
            load_context(root, case)
    if dataset.name == "quality_cases.jsonl":
        counts = Counter((case.category, case.difficulty) for case in cases)
        if len(cases) != 80 or Counter(case.locale for case in cases) != {"en": 40, "vi": 40} or (
            len(counts) != 24 or any(count != {"easy": 3, "medium": 4, "hard": 3}[difficulty]
                                     for (_, difficulty), count in counts.items())
        ):
            raise ValueError("Invalid held-out distribution")
        ids = {case.id for case in cases}
        if (len(manifest["smoke"]) != 8 or len(set(manifest["smoke"])) != 8
            or len(manifest["stability"]) != 16 or len(set(manifest["stability"])) != 16
            or not (set(manifest["smoke"]) | set(manifest["stability"])) <= ids
            or sum(bool(case.lifecycle_turns) for case in cases) != 8):
            raise ValueError("Invalid predefined subsets")
    if dataset.name == "security_live_cases.jsonl" and len(cases) != 36:
        raise ValueError("Expected 36 security cases")
    if dataset.name == "security_live_cases.jsonl" and (
        set(manifest["security"]) != {case.id for case in cases}
        or sorted(Counter(entry["group"] for entry in manifest["security"].values()).values()) != [6] * 6
    ):
        raise ValueError("Invalid security cohort")
    return cases, manifest


def load_context(root: Path, case: EvaluationCase) -> RagConversationContext:
    if case.history_fixture is None:
        return RagConversationContext(session_id=case.id, current_turn_index=1, completed_turn_count=0)
    context = RagConversationContext.model_validate_json((root / "histories" / case.history_fixture).read_bytes())
    indices = [turn.turn_index for turn in context.recent_turns]
    if indices != sorted(set(indices)) or any(index >= context.current_turn_index for index in indices):
        raise ValueError(f"Invalid historical turn ordering in {case.id}")
    if context.completed_turn_count != len(indices) or (
        context.summary and context.summary.covered_turn_count != sum(
            index <= context.summary.covered_turn_index for index in indices
        )
    ):
        raise ValueError(f"Invalid historical turn counts in {case.id}")
    return context
