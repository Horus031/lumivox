
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api.routes import native_task_risk
from app.core.config import settings
from app.main import app
from app.schemas.native_task_risk import (
    NativeTaskRiskBatchPredictResponse,
    NativeTaskRiskPredictResponse,
)

USER_ID = "11111111-1111-4111-8111-111111111111"
TASK_ID = "22222222-2222-4222-8222-222222222222"

client = TestClient(app)

REQUEST_CASES = [
    pytest.param(
        "/api/v1/native-task-risk/predict",
        {"user_id": USER_ID, "task_id": TASK_ID},
        id="single-predict",
    ),
    pytest.param(
        "/api/v1/native-task-risk/batch-predict",
        {"user_id": USER_ID, "task_ids": [TASK_ID]},
        id="batch-predict",
    ),
]


def make_prediction() -> NativeTaskRiskPredictResponse:
    return NativeTaskRiskPredictResponse(
        user_id=USER_ID,
        task_id=TASK_ID,
        goal_id=None,
        prediction_mode="native_ml",
        model_key="native_task_delay_risk_classifier",
        model_version="native-task-risk-v2-test",
        model_name="logistic_regression_balanced",
        risk_probability=0.75,
        risk_score=75.0,
        risk_band="high",
        predicted_late=True,
        decision_threshold=0.4,
        days_until_due=2,
        due_at="2026-11-16T18:00:00+00:00",
        features={"days_until_due": 2.0},
        reasons=[],
        prediction_id=None,
    )


@pytest.mark.parametrize("path,payload", REQUEST_CASES)
@pytest.mark.parametrize(
    "key_mode",
    ["missing", "invalid"],
)
def test_prediction_rejects_unauthorized_requests(
    monkeypatch,
    path,
    payload,
    key_mode,
):
    def forbidden_service(_request):
        raise AssertionError(
            "Prediction service must not run without authentication."
        )

    monkeypatch.setattr(
        native_task_risk,
        "predict_native_task_risk",
        forbidden_service,
    )
    monkeypatch.setattr(
        native_task_risk,
        "predict_native_task_risk_batch",
        forbidden_service,
    )

    headers = {}

    if key_mode == "invalid":
        headers = {
            "x-lumivox-internal-key":
                f"{settings.ai_internal_api_key}-invalid"
        }

    response = client.post(
        path,
        json=payload,
        headers=headers,
    )

    assert response.status_code == 401


def test_single_prediction_accepts_valid_internal_key(
    monkeypatch,
):
    received_task_ids = []

    def fake_predict(request):
        received_task_ids.append(request.task_id)
        return make_prediction()

    monkeypatch.setattr(
        native_task_risk,
        "predict_native_task_risk",
        fake_predict,
    )

    response = client.post(
        "/api/v1/native-task-risk/predict",
        json={
            "user_id": USER_ID,
            "task_id": TASK_ID,
        },
        headers={
            "x-lumivox-internal-key":
                settings.ai_internal_api_key
        },
    )

    assert response.status_code == 200, response.text
    assert received_task_ids == [TASK_ID]

    data = response.json()

    assert data["task_id"] == TASK_ID
    assert data["prediction_mode"] == "native_ml"
    assert data["risk_band"] == "high"
    assert data["risk_probability"] == 0.75


def test_batch_prediction_accepts_valid_internal_key(
    monkeypatch,
):
    received_task_ids = []

    def fake_batch_predict(request):
        received_task_ids.extend(request.task_ids)

        return NativeTaskRiskBatchPredictResponse(
            predictions=[make_prediction()],
            errors=[],
        )

    monkeypatch.setattr(
        native_task_risk,
        "predict_native_task_risk_batch",
        fake_batch_predict,
    )

    response = client.post(
        "/api/v1/native-task-risk/batch-predict",
        json={
            "user_id": USER_ID,
            "task_ids": [TASK_ID],
        },
        headers={
            "x-lumivox-internal-key":
                settings.ai_internal_api_key
        },
    )

    assert response.status_code == 200, response.text
    assert received_task_ids == [TASK_ID]

    data = response.json()

    assert len(data["predictions"]) == 1
    assert data["predictions"][0]["task_id"] == TASK_ID
    assert data["errors"] == []


def test_cron_refresh_still_requires_separate_secret(
    monkeypatch,
):
    def forbidden_cron(_request):
        raise AssertionError(
            "Cron service must not run without its secret."
        )

    monkeypatch.setattr(
        native_task_risk,
        "refresh_native_task_risk_for_cron",
        forbidden_cron,
    )

    response = client.post(
        "/api/v1/native-task-risk/cron-refresh",
        json={},
    )

    assert response.status_code == 401
