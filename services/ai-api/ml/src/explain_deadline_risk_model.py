from __future__ import annotations

import json
from pathlib import Path

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import shap

from sklearn.inspection import permutation_importance
from sklearn.metrics import f1_score, make_scorer
from sklearn.model_selection import train_test_split


BASE_DIR = Path(__file__).resolve().parents[1]

DATASET_PATH = (
    BASE_DIR / "data" / "processed" / "deadline_risk_dataset.csv"
)

MODEL_PATH = (
    BASE_DIR
    / "artifacts"
    / "deadline-risk"
    / "random_forest.joblib"
)

METRICS_PATH = (
    BASE_DIR
    / "reports"
    / "deadline-risk"
    / "deadline_risk_model_metrics.json"
)

REPORT_DIR = BASE_DIR / "reports" / "deadline-risk"

TARGET_COLUMN = "deadline_risk"
RANDOM_STATE = 42

# SHAP trên toàn bộ test set có thể nặng.
# 2,000 samples là đủ đẹp cho global explanation v1.
SHAP_GLOBAL_SAMPLE_SIZE = 2000

# Lưu local explanation cho vài case đại diện.
LOCAL_EXAMPLE_COUNT = 5


def ensure_dirs() -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)


def load_dataset() -> tuple[pd.DataFrame, pd.Series]:
    dataframe = pd.read_csv(DATASET_PATH)

    X = dataframe.drop(columns=[TARGET_COLUMN])
    y = dataframe[TARGET_COLUMN].astype(int)

    return X, y


def reproduce_test_split(
    X: pd.DataFrame,
    y: pd.Series,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series]:
    """
    Must match the split used in training script:
    - test_size=0.20
    - random_state=42
    - stratify=y
    """
    return train_test_split(
        X,
        y,
        test_size=0.20,
        random_state=RANDOM_STATE,
        stratify=y,
    )


def load_random_forest_pipeline():
    return joblib.load(MODEL_PATH)


def save_selected_model_decision(metrics: dict) -> None:
    logistic = metrics["logistic_regression"]
    forest = metrics["random_forest"]

    payload = {
        "selected_model": "random_forest",
        "decision_reason": (
            "Random Forest achieved superior performance across all primary "
            "classification metrics compared with Logistic Regression."
        ),
        "comparison": {
            "f1_score_difference": round(
                forest["f1_score"] - logistic["f1_score"],
                4,
            ),
            "precision_difference": round(
                forest["precision"] - logistic["precision"],
                4,
            ),
            "recall_difference": round(
                forest["recall"] - logistic["recall"],
                4,
            ),
            "roc_auc_difference": round(
                forest["roc_auc"] - logistic["roc_auc"],
                4,
            ),
        },
        "selected_model_metrics": {
            "f1_score": forest["f1_score"],
            "precision": forest["precision"],
            "recall": forest["recall"],
            "roc_auc": forest["roc_auc"],
        },
    }

    path = REPORT_DIR / "selected_model_decision.json"

    with path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2)


def calculate_permutation_importance(
    pipeline,
    X_test: pd.DataFrame,
    y_test: pd.Series,
) -> pd.DataFrame:
    """
    Permutation importance is computed on the full pipeline, using
    F1-score as the scoring metric because this is our main headline metric.
    """

    result = permutation_importance(
        estimator=pipeline,
        X=X_test,
        y=y_test,
        scoring=make_scorer(f1_score),
        n_repeats=10,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )

    importance_df = pd.DataFrame(
        {
            "feature": X_test.columns,
            "importance_mean": result.importances_mean,
            "importance_std": result.importances_std,
        }
    ).sort_values(
        by="importance_mean",
        ascending=False,
    )

    return importance_df


def save_permutation_importance_outputs(
    importance_df: pd.DataFrame,
) -> None:
    json_payload = importance_df.to_dict(orient="records")

    json_path = REPORT_DIR / "permutation_importance.json"
    with json_path.open("w", encoding="utf-8") as file:
        json.dump(json_payload, file, indent=2)

    plot_df = importance_df.sort_values(
        by="importance_mean",
        ascending=True,
    )

    plt.figure(figsize=(10, 6))
    plt.barh(
        plot_df["feature"],
        plot_df["importance_mean"],
        xerr=plot_df["importance_std"],
    )
    plt.xlabel("Decrease in F1-score after permutation")
    plt.ylabel("Feature")
    plt.title("Permutation Feature Importance — Random Forest Deadline Risk")
    plt.tight_layout()

    plot_path = REPORT_DIR / "permutation_importance.png"
    plt.savefig(plot_path, dpi=220, bbox_inches="tight")
    plt.close()


def extract_tree_model_and_transformed_features(
    pipeline,
    X: pd.DataFrame,
) -> tuple[object, np.ndarray, list[str]]:
    """
    Training pipeline:
    - imputer
    - model

    Random Forest itself receives imputed numeric features.
    We explain the final tree model on that transformed feature matrix.
    """

    imputer = pipeline.named_steps["imputer"]
    model = pipeline.named_steps["model"]

    transformed_X = imputer.transform(X)

    feature_names = list(X.columns)

    return model, transformed_X, feature_names


def calculate_shap_values(
    model,
    transformed_X: np.ndarray,
):
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(transformed_X)

    """
    For binary RandomForestClassifier, depending on SHAP version:
    - Could return list[class_0_array, class_1_array]
    - Could return ndarray with class dimension

    We standardise to values for positive class = deadline_risk = 1.
    """

    if isinstance(shap_values, list):
        positive_class_shap_values = shap_values[1]
    else:
        if shap_values.ndim == 3:
            positive_class_shap_values = shap_values[:, :, 1]
        else:
            positive_class_shap_values = shap_values

    return explainer, positive_class_shap_values


def save_shap_global_outputs(
    transformed_X: np.ndarray,
    shap_values: np.ndarray,
    feature_names: list[str],
) -> pd.DataFrame:
    mean_abs_shap = np.abs(shap_values).mean(axis=0)

    global_importance_df = pd.DataFrame(
        {
            "feature": feature_names,
            "mean_abs_shap": mean_abs_shap,
        }
    ).sort_values(
        by="mean_abs_shap",
        ascending=False,
    )

    json_path = REPORT_DIR / "shap_global_importance.json"
    with json_path.open("w", encoding="utf-8") as file:
        json.dump(
            global_importance_df.to_dict(orient="records"),
            file,
            indent=2,
        )

    shap.summary_plot(
        shap_values,
        transformed_X,
        feature_names=feature_names,
        plot_type="bar",
        show=False,
    )
    plt.title("Global SHAP Feature Importance — Deadline Risk Model")
    plt.tight_layout()

    bar_path = REPORT_DIR / "shap_summary_bar.png"
    plt.savefig(bar_path, dpi=220, bbox_inches="tight")
    plt.close()

    shap.summary_plot(
        shap_values,
        transformed_X,
        feature_names=feature_names,
        show=False,
    )
    plt.title("SHAP Beeswarm Summary — Deadline Risk Model")
    plt.tight_layout()

    beeswarm_path = REPORT_DIR / "shap_summary_beeswarm.png"
    plt.savefig(beeswarm_path, dpi=220, bbox_inches="tight")
    plt.close()

    return global_importance_df


def build_local_shap_examples(
    *,
    pipeline,
    X_test: pd.DataFrame,
    y_test: pd.Series,
    model,
    explainer,
    transformed_X: np.ndarray,
    shap_values: np.ndarray,
    feature_names: list[str],
) -> list[dict]:
    probabilities = pipeline.predict_proba(X_test)[:, 1]
    predictions = pipeline.predict(X_test)

    analysis_df = X_test.copy()
    analysis_df["actual_deadline_risk"] = y_test.values
    analysis_df["predicted_deadline_risk"] = predictions
    analysis_df["risk_probability"] = probabilities

    """
    Pick interesting examples:
    - Highest risk predictions
    - Prefer correct positives if available
    """
    candidate_indices = (
        analysis_df[
            (analysis_df["actual_deadline_risk"] == 1)
            & (analysis_df["predicted_deadline_risk"] == 1)
        ]
        .sort_values("risk_probability", ascending=False)
        .head(LOCAL_EXAMPLE_COUNT)
        .index
        .tolist()
    )

    if len(candidate_indices) < LOCAL_EXAMPLE_COUNT:
        fallback_indices = (
            analysis_df
            .sort_values("risk_probability", ascending=False)
            .head(LOCAL_EXAMPLE_COUNT)
            .index
            .tolist()
        )
        candidate_indices = fallback_indices

    position_lookup = {
        index: position
        for position, index in enumerate(X_test.index)
    }

    local_examples: list[dict] = []

    expected_value = explainer.expected_value

    if isinstance(expected_value, (list, np.ndarray)):
        if len(np.atleast_1d(expected_value)) > 1:
            positive_expected_value = float(np.atleast_1d(expected_value)[1])
        else:
            positive_expected_value = float(np.atleast_1d(expected_value)[0])
    else:
        positive_expected_value = float(expected_value)

    for original_index in candidate_indices:
        position = position_lookup[original_index]

        row = X_test.loc[original_index]
        row_shap_values = shap_values[position]

        feature_contributions = []

        for feature_name, feature_value, shap_value in zip(
            feature_names,
            row.values,
            row_shap_values,
        ):
            feature_contributions.append(
                {
                    "feature": feature_name,
                    "feature_value": float(feature_value),
                    "shap_value": float(shap_value),
                    "effect": (
                        "increases_risk"
                        if shap_value > 0
                        else "decreases_risk"
                    ),
                }
            )

        sorted_by_absolute_impact = sorted(
            feature_contributions,
            key=lambda item: abs(item["shap_value"]),
            reverse=True,
        )

        local_examples.append(
            {
                "dataset_row_index": int(original_index),
                "actual_deadline_risk": int(
                    analysis_df.loc[
                        original_index,
                        "actual_deadline_risk",
                    ]
                ),
                "predicted_deadline_risk": int(
                    analysis_df.loc[
                        original_index,
                        "predicted_deadline_risk",
                    ]
                ),
                "risk_probability": round(
                    float(
                        analysis_df.loc[
                            original_index,
                            "risk_probability",
                        ]
                    ),
                    6,
                ),
                "baseline_expected_value": positive_expected_value,
                "top_positive_contributors": [
                    item
                    for item in sorted_by_absolute_impact
                    if item["shap_value"] > 0
                ][:5],
                "top_negative_contributors": [
                    item
                    for item in sorted_by_absolute_impact
                    if item["shap_value"] < 0
                ][:5],
            }
        )

    return local_examples


def save_local_examples(local_examples: list[dict]) -> None:
    path = REPORT_DIR / "shap_local_examples.json"

    with path.open("w", encoding="utf-8") as file:
        json.dump(local_examples, file, indent=2)


def main() -> None:
    ensure_dirs()

    print("Loading metrics and selected model...")
    with METRICS_PATH.open("r", encoding="utf-8") as file:
        metrics = json.load(file)

    save_selected_model_decision(metrics)

    print("Loading dataset...")
    X, y = load_dataset()

    _, X_test, _, y_test = reproduce_test_split(X, y)

    print(f"Test set rows: {len(X_test):,}")

    pipeline = load_random_forest_pipeline()

    print("Calculating permutation importance...")
    permutation_df = calculate_permutation_importance(
        pipeline=pipeline,
        X_test=X_test,
        y_test=y_test,
    )
    save_permutation_importance_outputs(permutation_df)

    print("Preparing SHAP analysis sample...")
    shap_sample = X_test.sample(
        n=min(SHAP_GLOBAL_SAMPLE_SIZE, len(X_test)),
        random_state=RANDOM_STATE,
    )

    model, transformed_shap_sample, feature_names = (
        extract_tree_model_and_transformed_features(
            pipeline=pipeline,
            X=shap_sample,
        )
    )

    print("Calculating global SHAP values...")
    explainer, shap_values = calculate_shap_values(
        model=model,
        transformed_X=transformed_shap_sample,
    )

    global_importance_df = save_shap_global_outputs(
        transformed_X=transformed_shap_sample,
        shap_values=shap_values,
        feature_names=feature_names,
    )

    print("Top global SHAP features:")
    print(global_importance_df.head(10))

    print("Calculating local SHAP examples...")

    model_full, transformed_full_test, feature_names_full = (
        extract_tree_model_and_transformed_features(
            pipeline=pipeline,
            X=X_test,
        )
    )

    explainer_full, shap_values_full = calculate_shap_values(
        model=model_full,
        transformed_X=transformed_full_test,
    )

    local_examples = build_local_shap_examples(
        pipeline=pipeline,
        X_test=X_test,
        y_test=y_test,
        model=model_full,
        explainer=explainer_full,
        transformed_X=transformed_full_test,
        shap_values=shap_values_full,
        feature_names=feature_names_full,
    )

    save_local_examples(local_examples)

    print("Explainability analysis completed successfully.")
    print(f"Outputs saved in: {REPORT_DIR}")


if __name__ == "__main__":
    main()