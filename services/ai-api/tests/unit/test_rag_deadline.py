from types import SimpleNamespace

import pytest

from app.core import rag_deadline
from app.core.rag_deadline import RagDeadline, RagDeadlineExceeded


def test_summary_deadline_preserves_shared_answer_reserve(monkeypatch):
    now = [100.0]
    monkeypatch.setattr(rag_deadline, "time", SimpleNamespace(monotonic=lambda: now[0]))
    request = RagDeadline.start(25)
    assert request.bounded(5, reserve=9).remaining() == 5
    now[0] = 113
    assert request.bounded(5, reserve=9).remaining() == 3
    now[0] = 116
    with pytest.raises(RagDeadlineExceeded):
        request.bounded(5, reserve=9).require_remaining()
    assert request.remaining() == 9


def test_child_deadline_never_extends_parent(monkeypatch):
    monkeypatch.setattr(rag_deadline, "time", SimpleNamespace(monotonic=lambda: 100))
    assert RagDeadline.start(2).bounded(15).remaining() == 2
