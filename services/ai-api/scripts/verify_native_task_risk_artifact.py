from __future__ import annotations

import json
from pathlib import Path

import joblib


AI_API_DIR = Path(__file__).resolve().parents[1]
ARTIFACT_DIR = AI_API_DIR / "ml" / "artifacts" / "native-task-risk"
ARTIFACT_PATH = ARTIFACT_DIR / "native_task_risk_best_model.joblib"
METADATA_PATH = ARTIFACT_DIR / "native_task_risk_model_metadata.json"


def main() -> None:
    if not ARTIFACT_PATH.exists():
        raise SystemExit(f"Missing native task risk artifact: {ARTIFACT_PATH}")
    if not METADATA_PATH.exists():
        raise SystemExit(f"Missing native task risk metadata: {METADATA_PATH}")

    with METADATA_PATH.open("r", encoding="utf-8") as file:
        metadata = json.load(file)
    artifact = joblib.load(ARTIFACT_PATH)

    required = [
        "model_key",
        "model_version",
        "selected_algorithm",
        "feature_schema_version",
        "feature_columns",
        "threshold",
    ]
    for key in required:
        if key not in metadata or key not in artifact:
            raise SystemExit(f"Missing required model contract key: {key}")

    for key in ("model_key", "model_version", "feature_schema_version", "feature_columns"):
        if metadata[key] != artifact[key]:
            raise SystemExit(f"Artifact/metadata mismatch: {key}")

    if abs(float(metadata["threshold"]) - float(artifact["threshold"])) > 1e-9:
        raise SystemExit("Artifact/metadata mismatch: threshold")

    model = artifact.get("model")
    if model is None or not hasattr(model, "predict_proba"):
        raise SystemExit("Artifact model is missing predict_proba")

    print(
        "Native task risk artifact OK:",
        metadata["model_version"],
        metadata["selected_algorithm"],
        f"threshold={metadata['threshold']}",
    )


if __name__ == "__main__":
    main()
