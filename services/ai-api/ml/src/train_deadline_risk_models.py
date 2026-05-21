from __future__ import annotations

import json
from pathlib import Path

import joblib
import matplotlib.pyplot as plt
import pandas as pd

from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    ConfusionMatrixDisplay,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    RocCurveDisplay,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


BASE_DIR = Path(__file__).resolve().parents[1]
DATASET_PATH = BASE_DIR / "data" / "processed" / "deadline_risk_dataset.csv"
ARTIFACT_DIR = BASE_DIR / "artifacts" / "deadline-risk"
REPORT_DIR = BASE_DIR / "reports" / "deadline-risk"

TARGET_COLUMN = "deadline_risk"
RANDOM_STATE = 42


def ensure_dirs() -> None:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)


def load_dataset() -> tuple[pd.DataFrame, pd.Series]:
    dataframe = pd.read_csv(DATASET_PATH)

    X = dataframe.drop(columns=[TARGET_COLUMN])
    y = dataframe[TARGET_COLUMN].astype(int)

    return X, y


def build_logistic_regression_pipeline() -> Pipeline:
    return Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
            (
                "model",
                LogisticRegression(
                    max_iter=2000,
                    class_weight="balanced",
                    random_state=RANDOM_STATE,
                ),
            ),
        ]
    )


def build_random_forest_pipeline() -> Pipeline:
    return Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            (
                "model",
                RandomForestClassifier(
                    n_estimators=300,
                    max_depth=12,
                    min_samples_leaf=5,
                    class_weight="balanced_subsample",
                    random_state=RANDOM_STATE,
                    n_jobs=-1,
                ),
            ),
        ]
    )


def evaluate_model(
    *,
    model_name: str,
    model: Pipeline,
    X_test: pd.DataFrame,
    y_test: pd.Series,
) -> dict:
    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]

    metrics = {
        "f1_score": round(float(f1_score(y_test, y_pred)), 4),
        "precision": round(float(precision_score(y_test, y_pred)), 4),
        "recall": round(float(recall_score(y_test, y_pred)), 4),
        "roc_auc": round(float(roc_auc_score(y_test, y_proba)), 4),
        "classification_report": classification_report(
            y_test,
            y_pred,
            output_dict=True,
            zero_division=0,
        ),
        "confusion_matrix": confusion_matrix(y_test, y_pred).tolist(),
    }

    confusion_display = ConfusionMatrixDisplay.from_predictions(
        y_test,
        y_pred,
        display_labels=["No Risk", "Risk"],
        cmap="Blues",
    )
    confusion_display.ax_.set_title(f"{model_name} — Confusion Matrix")

    confusion_path = REPORT_DIR / f"{model_name}_confusion_matrix.png"
    plt.savefig(confusion_path, bbox_inches="tight")
    plt.close()

    roc_display = RocCurveDisplay.from_predictions(
        y_test,
        y_proba,
        name=model_name,
    )
    roc_display.ax_.set_title(f"{model_name} — ROC Curve")

    roc_path = REPORT_DIR / f"{model_name}_roc_curve.png"
    plt.savefig(roc_path, bbox_inches="tight")
    plt.close()

    return metrics


def save_metrics(metrics: dict) -> None:
    metrics_path = REPORT_DIR / "deadline_risk_model_metrics.json"

    with metrics_path.open("w", encoding="utf-8") as file:
        json.dump(metrics, file, indent=2)


def main() -> None:
    ensure_dirs()

    print("Loading processed Deadline Risk dataset...")
    X, y = load_dataset()

    print(f"Rows: {len(X):,}")
    print(f"Features: {list(X.columns)}")
    print("Target distribution:")
    print(y.value_counts(normalize=True).round(4))

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.20,
        random_state=RANDOM_STATE,
        stratify=y,
    )

    models = {
        "logistic_regression": build_logistic_regression_pipeline(),
        "random_forest": build_random_forest_pipeline(),
    }

    all_metrics: dict[str, dict] = {}

    for model_name, model in models.items():
        print(f"Training {model_name}...")
        model.fit(X_train, y_train)

        print(f"Evaluating {model_name}...")
        metrics = evaluate_model(
            model_name=model_name,
            model=model,
            X_test=X_test,
            y_test=y_test,
        )

        all_metrics[model_name] = metrics

        model_path = ARTIFACT_DIR / f"{model_name}.joblib"
        joblib.dump(model, model_path)

        print(f"Saved model: {model_path}")

    save_metrics(all_metrics)

    print("Training completed.")
    print("Metrics saved to deadline_risk_model_metrics.json")


if __name__ == "__main__":
    main()