import re

from app.core.rag_token_budget import count_text_tokens

NUMERIC_ARRAY_PATTERN = re.compile(
    r"\[\s*-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?){1,19}\s*\]"
)
RESULT_PATTERN = re.compile(
    r"(?im)^[ \t]*(?:final result|result|output|kết quả cuối cùng|kết quả)[ \t]*:[ \t]*[^\n]+$"
)
ARTIFACT_LABELS = ("Learner-provided inputs:", "Earlier assistant results:")
_LABELED_ARTIFACT = re.compile(r"(?m)^(" + "|".join(map(re.escape, ARTIFACT_LABELS)) + r")[^\n]*")


def extract_learning_artifacts(text: str, *, max_tokens: int = 100) -> list[str]:
    results = [match.group().strip() for match in RESULT_PATTERN.finditer(text)]
    candidates = [*results, *(match.group() for match in NUMERIC_ARRAY_PATTERN.finditer(text)
                             if not any(match.group() in result for result in results))]
    selected = []
    for artifact in dict.fromkeys(candidates):
        if (len(artifact) <= 240 and "[redacted]" not in artifact
            and artifact.count("[") == artifact.count("]")
            and count_text_tokens("; ".join([*selected, artifact])) <= max_tokens):
            selected.append(artifact)
    return selected


def artifact_excerpt(text: str, excerpt: str) -> str:
    for pattern in (_LABELED_ARTIFACT, RESULT_PATTERN, NUMERIC_ARRAY_PATTERN):
        for match in pattern.finditer(text):
            if match.start() < len(excerpt) < match.end():
                excerpt = excerpt[:match.start()].rstrip()
    # An outer array may still be open after complete inner arrays.
    unclosed = []
    for index, char in enumerate(excerpt):
        if char == "[":
            unclosed.append(index)
        elif char == "]" and unclosed:
            unclosed.pop()
    if unclosed:
        excerpt = excerpt[:unclosed[0]].rstrip()
    return excerpt
