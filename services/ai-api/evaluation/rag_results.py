import json
import os
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import TextIO


def append_jsonl(file: TextIO, record: dict):
    file.write(json.dumps(record, ensure_ascii=False, allow_nan=False) + "\n")
    file.flush()


@contextmanager
def locked_results(file: TextIO):
    if os.name == "nt":
        import msvcrt

        msvcrt.locking(file.fileno(), msvcrt.LK_NBLCK, 1)
        try:
            yield
        finally:
            file.seek(0)
            msvcrt.locking(file.fileno(), msvcrt.LK_UNLCK, 1)
    else:
        import fcntl

        fcntl.flock(file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            fcntl.flock(file.fileno(), fcntl.LOCK_UN)


@contextmanager
def open_results(path: Path, plan: dict, resume: bool) -> Iterator[tuple[TextIO, set[str]]]:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("r+" if resume else "x", encoding="utf-8", newline="\n") as file, locked_results(file):
        if not resume:
            append_jsonl(file, {"plan": plan})
            yield file, set()
            return
        if json.loads(file.readline()) != {"plan": plan}:
            raise ValueError("Resume plan differs from the original run")
        ids = set()
        for line in file:
            row = json.loads(line)
            key = row["case_id"]
            if not line.endswith("\n") or key in ids or key not in plan["case_ids"]:
                raise ValueError("Duplicate, incomplete or unscheduled result")
            ids.add(key)
        yield file, ids
