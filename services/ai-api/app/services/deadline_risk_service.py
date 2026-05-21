from __future__ import annotations

from uuid import UUID

import numpy as np
import pandas as pd

from app.clients.supabase_client import get_supabase_client
from app.core.config import settings
from app.schemas.deadline_risk import (
    DeadlineRiskExplanationResponse,
    DeadlineRiskFeatureAttributionResponse,
    DeadlineRiskPredictionRequest,
    DeadlineRiskPredictionResponse,
)
from app.services.deadline_risk_runtime import DeadlineRiskRuntime


DECISION_THRESHOLD = 0.5


def _select_positive_class_shap_values(shap_values):
    if isinstance(shap_values, list):
        return shap_values[1]

    if getattr(shap_values, "ndim", None) == 3:
        return shap_values[:, :, 1]

    return shap_values


def _get_positive_expected_value(expected_value) -> float:
    values = np.atleast_1d(expected_value)

    if len(values) > 1:
        return float(values[1])

    return float(values[0])


def _build_attributions(
    *,
    feature_names: list[str],
    feature_values: list[float],
    shap_values: list[float],
) -> list[dict]:
    attributions = []

    for feature_name, feature_value, shap_value in zip(
        feature_names,
        feature_values,
        shap_values,
    ):
        if shap_value > 0:
            effect = "increases_risk"
        elif shap_value < 0:
            effect = "decreases_risk"
        else:
            effect = "neutral"

        attributions.append(
            {
                "feature": feature_name,
                "feature_value": float(feature_value),
                "shap_value": float(shap_value),
                "effect": effect,
            }
        )

    attributions.sort(
        key=lambda item: abs(item["shap_value"]),
        reverse=True,
    )

    return attributions


def _get_active_model_version_id() -> str:
    supabase = get_supabase_client()

    result = (
        supabase.table("ml_model_versions")
        .select("id")
        .eq("model_key", settings.deadline_risk_model_key)
        .eq("version", settings.deadline_risk_model_version)
        .eq("is_active", True)
        .single()
        .execute()
    )

    if not result.data:
        raise RuntimeError(
            "Active deadline risk model version is not registered in database."
        )

    return result.data["id"]


def _persist_prediction(
    *,
    request_payload: DeadlineRiskPredictionRequest,
    risk_probability: float,
    predicted_label: bool,
    baseline_expected_value: float,
    attributions: list[dict],
) -> UUID:
    supabase = get_supabase_client()

    model_version_id = _get_active_model_version_id()

    prediction_insert = (
        supabase.table("deadline_risk_predictions")
        .insert(
            {
                "user_id": (
                    str(request_payload.user_id)
                    if request_payload.user_id
                    else None
                ),
                "task_id": (
                    str(request_payload.task_id)
                    if request_payload.task_id
                    else None
                ),
                "model_version_id": model_version_id,
                "input_mode": request_payload.input_mode,
                "risk_probability": risk_probability,
                "predicted_label": predicted_label,
                "decision_threshold": DECISION_THRESHOLD,
                "feature_payload": request_payload.features.model_dump(),
                "prediction_metadata": {
                    "source": "FastAPI deadline risk inference endpoint",
                    "model_key": settings.deadline_risk_model_key,
                    "model_version": settings.deadline_risk_model_version,
                },
            }
        )
        .execute()
    )

    prediction_id = prediction_insert.data[0]["id"]

    top_positive = [
        item
        for item in attributions
        if item["effect"] == "increases_risk"
    ][:5]

    top_negative = [
        item
        for item in attributions
        if item["effect"] == "decreases_risk"
    ][:5]

    supabase.table("deadline_risk_prediction_explanations").insert(
        {
            "prediction_id": prediction_id,
            "baseline_expected_value": baseline_expected_value,
            "top_positive_contributors": top_positive,
            "top_negative_contributors": top_negative,
            "explanation_method": "shap_tree_explainer",
            "explanation_version": "v1",
        }
    ).execute()

    attribution_rows = []

    for rank, item in enumerate(attributions, start=1):
        attribution_rows.append(
            {
                "prediction_id": prediction_id,
                "feature_name": item["feature"],
                "feature_value": item["feature_value"],
                "shap_value": item["shap_value"],
                "effect": item["effect"],
                "absolute_rank": rank,
            }
        )

    supabase.table("deadline_risk_feature_attributions").insert(
        attribution_rows
    ).execute()

    return UUID(prediction_id)


def predict_deadline_risk(
    *,
    runtime: DeadlineRiskRuntime,
    payload: DeadlineRiskPredictionRequest,
) -> DeadlineRiskPredictionResponse:
    feature_dict = payload.features.model_dump()

    dataframe = pd.DataFrame(
        [[feature_dict[name] for name in runtime.feature_names]],
        columns=runtime.feature_names,
    )

    risk_probability = float(
        runtime.pipeline.predict_proba(dataframe)[0][1]
    )

    predicted_label = risk_probability >= DECISION_THRESHOLD

    transformed_features = runtime.imputer.transform(dataframe)

    raw_shap_values = runtime.explainer.shap_values(transformed_features)
    positive_class_shap_values = _select_positive_class_shap_values(
        raw_shap_values
    )

    local_shap_values = positive_class_shap_values[0].tolist()

    baseline_expected_value = _get_positive_expected_value(
        runtime.explainer.expected_value
    )

    attributions = _build_attributions(
        feature_names=runtime.feature_names,
        feature_values=[
            float(feature_dict[name])
            for name in runtime.feature_names
        ],
        shap_values=local_shap_values,
    )

    top_positive = [
        DeadlineRiskFeatureAttributionResponse(**item)
        for item in attributions
        if item["effect"] == "increases_risk"
    ][:5]

    top_negative = [
        DeadlineRiskFeatureAttributionResponse(**item)
        for item in attributions
        if item["effect"] == "decreases_risk"
    ][:5]

    prediction_id = None

    if payload.persist_prediction:
        prediction_id = _persist_prediction(
            request_payload=payload,
            risk_probability=risk_probability,
            predicted_label=predicted_label,
            baseline_expected_value=baseline_expected_value,
            attributions=attributions,
        )

    return DeadlineRiskPredictionResponse(
        prediction_id=prediction_id,
        model_key=settings.deadline_risk_model_key,
        model_version=settings.deadline_risk_model_version,
        risk_probability=round(risk_probability, 6),
        predicted_label=predicted_label,
        decision_threshold=DECISION_THRESHOLD,
        explanation=DeadlineRiskExplanationResponse(
            baseline_expected_value=baseline_expected_value,
            top_positive_contributors=top_positive,
            top_negative_contributors=top_negative,
        ),
    )