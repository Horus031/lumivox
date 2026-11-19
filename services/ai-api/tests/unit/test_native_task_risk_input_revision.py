
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.services.native_task_risk_service import (
    _assert_native_task_risk_revision_unchanged,
    _get_native_task_risk_input_revision,
)


def test_missing_revision_defaults_to_zero():
    supabase = MagicMock()

    supabase.table.return_value \
        .select.return_value \
        .eq.return_value \
        .maybe_single.return_value \
        .execute.return_value = SimpleNamespace(data=None)

    assert _get_native_task_risk_input_revision(
        supabase,
        "00000000-0000-4000-8000-000000000101",
    ) == 0


def test_existing_revision_is_read():
    supabase = MagicMock()

    supabase.table.return_value \
        .select.return_value \
        .eq.return_value \
        .maybe_single.return_value \
        .execute.return_value = SimpleNamespace(
            data={"revision": 14},
        )

    assert _get_native_task_risk_input_revision(
        supabase,
        "00000000-0000-4000-8000-000000000101",
    ) == 14


def test_unchanged_revision_is_accepted():
    _assert_native_task_risk_revision_unchanged(12, 12)


def test_changed_revision_is_rejected():
    with pytest.raises(
        RuntimeError,
        match="inputs changed during prediction",
    ):
        _assert_native_task_risk_revision_unchanged(12, 13)


def test_database_failure_must_not_be_treated_as_revision_zero():
    supabase = MagicMock()

    supabase.table.return_value \
        .select.return_value \
        .eq.return_value \
        .maybe_single.return_value \
        .execute.side_effect = RuntimeError("database unavailable")

    with pytest.raises(RuntimeError, match="database unavailable"):
        _get_native_task_risk_input_revision(
            supabase,
            "00000000-0000-4000-8000-000000000101",
        )
