from __future__ import annotations

import json
from pathlib import Path


AI_API_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = AI_API_DIR.parent.parent


def _env_keys(path: Path) -> set[str]:
    keys: set[str] = set()

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key, _ = line.split("=", 1)
        keys.add(key.strip())

    return keys


def test_ai_api_uses_single_supabase_backend_secret_name() -> None:
    deprecated_name = "SUPABASE_SERVICE_ROLE_KEY"

    offenders = [
        str(path.relative_to(REPO_ROOT))
        for path in (AI_API_DIR / "app").rglob("*.py")
        if deprecated_name in path.read_text(encoding="utf-8")
    ]

    assert offenders == [], (
        "AI API code must use the shared Supabase client backed by "
        "SUPABASE_SECRET_KEY only. Offenders: "
        + ", ".join(offenders)
    )


def test_ai_api_env_example_covers_runtime_contract() -> None:
    keys = _env_keys(AI_API_DIR / ".env.example")

    required = {
        "SUPABASE_URL",
        "SUPABASE_SECRET_KEY",
        "AI_INTERNAL_API_KEY",
        "WEB_APP_URL",
        "RAG_CHUNK_SIZE_CHARS",
        "RAG_CHUNK_OVERLAP_CHARS",
        "RAG_MAX_CHUNKS_PER_DOCUMENT",
        "NATIVE_TASK_RISK_REQUIRE_MODEL",
        "NATIVE_TASK_RISK_MODEL_PATH",
        "NATIVE_TASK_RISK_METADATA_PATH",
        "NATIVE_TASK_RISK_CRON_SECRET",
        "ML_ARTIFACT_BUCKET",
        "DEADLINE_RISK_MODEL_PATH",
        "DEADLINE_RISK_MODEL_OBJECT_PATH",
    }

    assert required <= keys


def test_web_env_example_covers_cron_contract() -> None:
    keys = _env_keys(REPO_ROOT / "apps" / "web" / ".env.example")

    assert {"CRON_SECRET", "NATIVE_TASK_RISK_CRON_SECRET"} <= keys


def test_training_ci_and_runtime_versions_match() -> None:
    metadata_path = (
        AI_API_DIR
        / "ml"
        / "artifacts"
        / "native-task-risk"
        / "logistic_regression_balanced_metadata.json"
    )
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    runtime = metadata["runtime"]

    python_version = (AI_API_DIR / ".python-version").read_text(
        encoding="utf-8"
    ).strip()
    requirements = (AI_API_DIR / "requirements.txt").read_text(
        encoding="utf-8"
    )
    ci_workflow = (REPO_ROOT / ".github" / "workflows" / "ci.yml").read_text(
        encoding="utf-8"
    )

    assert python_version == runtime["python"]
    assert f"scikit-learn=={runtime['scikit_learn']}" in requirements
    assert f"joblib=={runtime['joblib']}" in requirements
    assert "python-version-file: services/ai-api/.python-version" in ci_workflow
