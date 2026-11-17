from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.schemas.native_task_risk import NativeTaskRiskBatchPredictRequest
from app.services import native_task_risk_service as service


REQUEST_ID = "60000000-0000-4000-8000-000000000051"
REQUEST = NativeTaskRiskBatchPredictRequest(
    user_id="owner", task_ids=["task"], recovery_request_id=REQUEST_ID, persist=True
)


@pytest.mark.parametrize("claimed", [True, False])
def test_failed_inference_finishes_only_a_claimed_request(monkeypatch, claimed):
    calls = []

    def rpc(name, args):
        calls.append((name, args))
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=claimed))

    infer = Mock(side_effect=RuntimeError("ML unavailable"))
    monkeypatch.setattr(service, "_get_supabase_admin", lambda: SimpleNamespace(rpc=rpc))
    monkeypatch.setattr(service, "predict_native_task_risk", infer)
    result = service.predict_native_task_risk_batch(REQUEST)
    assert not result.predictions and len(result.errors) == 1
    claim, finish = "claim_task_risk_reassessment", "finish_task_risk_reassessment"
    assert [name for name, _ in calls] == ([claim, finish] if claimed else [claim])
    assert all(args == {
        "p_user_id": "owner", "p_task_id": "task", "p_request_id": REQUEST_ID,
    } for _, args in calls)
    if claimed:
        assert result.errors[0].error == "ML unavailable"
        assert infer.call_args.kwargs == {"recovery_request_id": REQUEST_ID}
    else:
        infer.assert_not_called()

