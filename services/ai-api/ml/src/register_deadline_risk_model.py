from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from app.clients.supabase_client import get_supabase_client
from app.core.config import settings


BASE_DIR = Path(__file__).resolve().parents[1]

METRICS_PATH = (
    BASE_DIR
    / "reports"
    / "deadline-risk"
    / "deadline_risk_model_metrics.json"
)

SHAP_GLOBAL_PATH = (
    BASE_DIR
    / "reports"
    / "deadline-risk"
    / "shap_global_importance.json"
)

DATASET_PATH = (
    BASE_DIR
    / "data"
    / "processed"
    / "deadline_risk_dataset.csv"
)

TARGET_COLUMN = "deadline_risk"


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def build_feature_schema() -> dict:
    dataset = pd.read_csv(DATASET_PATH, nrows=5)

    feature_names = [
        column
        for column in dataset.columns
        if column != TARGET_COLUMN
    ]

    return {
        "feature_names": feature_names,
        "target_column": TARGET_COLUMN,
        "positive_class": 1,
        "prediction_horizon_days": 7,
        "input_mode": "oulad_compatible_features",
    }


def main() -> None:
    supabase = get_supabase_client()

    metrics = load_json(METRICS_PATH)
    shap_global_importance = load_json(SHAP_GLOBAL_PATH)

    random_forest_metrics = metrics["random_forest"]

    feature_schema = build_feature_schema()

    payload = {
        "model_key": settings.deadline_risk_model_key,
        "version": settings.deadline_risk_model_version,
        "algorithm": "RandomForestClassifier",
        "training_dataset": "OULAD deadline risk dataset — 7-day prediction horizon",
        "artifact_path": settings.deadline_risk_model_path,
        "metrics": {
            "f1_score": random_forest_metrics["f1_score"],
            "precision": random_forest_metrics["precision"],
            "recall": random_forest_metrics["recall"],
            "roc_auc": random_forest_metrics["roc_auc"],
            "accuracy": random_forest_metrics["classification_report"]["accuracy"],
            "confusion_matrix": random_forest_metrics["confusion_matrix"],
        },
        "feature_schema": feature_schema,
        "explainability_metadata": {
            "method": "SHAP TreeExplainer",
            "global_feature_importance": shap_global_importance,
        },
        "is_active": True,
    }

    # Deactivate previous active versions of the same model key.
    supabase.table("ml_model_versions").update(
        {"is_active": False}
    ).eq(
        "model_key",
        settings.deadline_risk_model_key,
    ).execute()

    existing = (
        supabase.table("ml_model_versions")
        .select("id")
        .eq("model_key", settings.deadline_risk_model_key)
        .eq("version", settings.deadline_risk_model_version)
        .maybe_single()
        .execute()
    )

    if existing is not None:
        result = (
            supabase.table("ml_model_versions")
            .update(payload)
            .eq("id", existing.data["id"])
            .execute()
        )

        print("Updated existing model registry row.")
        print(result.data)
    else:
        result = (
            supabase.table("ml_model_versions")
            .insert(payload)
            .execute()
        )

        print("Inserted new model registry row.")
        print(result.data)


if __name__ == "__main__":
    main()