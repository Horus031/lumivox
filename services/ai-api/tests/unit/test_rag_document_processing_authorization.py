from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.core.config import settings
from app.services import rag_document_processing_service as service
from app.services.rag_conversation_store import RagConversationError


@pytest.fixture
def pipeline(monkeypatch):
    database = Mock()
    database.storage.from_.return_value.download.return_value = b"Study material"
    monkeypatch.setattr(service, "_get_supabase_admin", lambda: database)
    monkeypatch.setattr(service, "_chunk_text", lambda *_, **__: ["password: synthetic-value", "Second chunk"])
    monkeypatch.setattr(settings, "rag_privacy_filter_enabled", True)
    embed = Mock(return_value=SimpleNamespace(embeddings=[SimpleNamespace(values=[0.1] * 768)]))
    monkeypatch.setattr(service, "_configure_gemini", lambda: SimpleNamespace(models=SimpleNamespace(embed_content=embed)))
    return database, embed


def simulate_rpc(monkeypatch, *, deny_at=None):
    calls = []

    def rpc(_database, name, args):
        calls.append((name, args))
        if name == "rag_begin_document_processing":
            return {"id": "document", "owner_id": "owner", "file_name": "note.txt",
                    "file_path": "note.txt", "mime_type": "text/plain"}
        if name == "rag_assert_document_processing":
            validations = sum(name == method for method, _ in calls)
            if deny_at == validations:
                raise RagConversationError("RAG_DOCUMENT_ACCESS_DENIED", 403)
            return True
        if deny_at == "finish":
            raise RagConversationError("RAG_DOCUMENT_PROCESSING_STALE", 409)
        return len(args["p_chunks"])

    monkeypatch.setattr(service, "_call_rpc", rpc)
    return calls


@pytest.mark.parametrize(("deny_at", "dispatches"), [(1, 0), (2, 1), ("finish", 2)])
def test_revocation_or_supersession_stops_indexing(pipeline, monkeypatch, deny_at, dispatches):
    calls = simulate_rpc(monkeypatch, deny_at=deny_at)
    with pytest.raises(RagConversationError):
        service.process_learning_document("document", "owner")
    assert pipeline[1].call_count == dispatches
    assert sum(name == "rag_finish_document_processing" for name, _ in calls) == int(deny_at == "finish")


def test_authorization_and_atomic_persistence_share_job_identity(pipeline, monkeypatch):
    calls = simulate_rpc(monkeypatch)
    result = service.process_learning_document("document", "owner")
    assert result["status"] == "completed" and result["chunk_count"] == 2
    assert len({args["p_operation_id"] for _, args in calls}) == 1
    assert [name for name, _ in calls] == [
        "rag_begin_document_processing", "rag_assert_document_processing",
        "rag_assert_document_processing", "rag_finish_document_processing",
    ]
    assert "synthetic-value" not in pipeline[1].call_args_list[0].kwargs["contents"]
    assert "synthetic-value" in calls[-1][1]["p_chunks"][0]["content"]
    pipeline[0].table.assert_not_called()
