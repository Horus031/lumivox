import pytest
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

from evaluation.rag_dataset import read_jsonl
from evaluation.rag_results import append_jsonl, open_results
from scripts import verify_rag_comparative as runner


def test_resume_preserves_prior_attempts_including_failure(tmp_path):
    path = tmp_path / "attempts.jsonl"
    plan = {"case_ids": ["first", "second"], "dataset_sha256": "digest", "variant": "D",
            "repetition": 1, "configuration": {"model": "stable"}}
    first = {"case_id": "first", "status": "rate_limited"}
    second = {"case_id": "second", "status": "completed"}
    with open_results(path, plan, False) as (file, completed):
        assert not completed
        append_jsonl(file, first)
    with pytest.raises(FileExistsError), open_results(path, plan, False):
        pass
    for change in ({"repetition": 2}, {"variant": "A"}, {"dataset_sha256": "other"},
                   {"configuration": {"model": "different"}}):
        with pytest.raises(ValueError, match="Resume plan"), open_results(path, plan | change, True):
            pass
    with open_results(path, plan, True) as (file, completed):
        assert completed == {"first"}
        with pytest.raises(OSError), open_results(path, plan, True):
            pass
        append_jsonl(file, second)
    assert read_jsonl(path) == [{"plan": plan}, first, second]


def test_failed_continue_accounting_does_not_mask_the_operation_error(monkeypatch):
    database = Mock()
    ask_table = Mock()
    ask_table.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"id": str(uuid4()), "provider_attempt_metadata": []},
    ]

    def table(name):
        if name == "rag_chat_preparations":
            raise RuntimeError("Audit transport unavailable")
        return ask_table

    database.table.side_effect = table
    monkeypatch.setattr(runner, "get_supabase_client", lambda: database)
    monkeypatch.setattr(runner.settings, "rag_durable_accounting_enabled", False)
    monkeypatch.setattr(runner, "create_focus", lambda *_: str(uuid4()))
    monkeypatch.setattr(runner, "ask_rag_conversation_question", lambda **_: {"session_id": str(uuid4())})
    original = RuntimeError("Original Continue failure")
    monkeypatch.setattr(runner, "start_new_conversation", Mock(side_effect=original))
    case = SimpleNamespace(document_keys=[], locale="en", lifecycle_turns=["Earlier question"], category="handoff")
    result = {}
    with pytest.raises(RuntimeError) as caught:
        runner.lifecycle(case, {"users": {"owner": str(uuid4())}, "documents": {}}, result)
    assert caught.value is original
    assert result["operation_audit"][-1] == {
        "operation": "continue", "provider_calls": None, "accounting_unavailable": True,
    }
