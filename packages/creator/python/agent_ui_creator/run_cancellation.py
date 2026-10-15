"""Run-scoped cancellation probe shared by side-effect entry points."""
from __future__ import annotations

import asyncio
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path
from typing import Callable, Iterator


_cancel_probe: ContextVar[Callable[[], bool] | None] = ContextVar(
    "creator_cancel_probe", default=None,
)
_cancel_marker: ContextVar[Path | None] = ContextVar(
    "creator_cancel_marker", default=None,
)


@contextmanager
def bind_run_cancellation(probe: Callable[[], bool], marker: Path) -> Iterator[None]:
    probe_token = _cancel_probe.set(probe)
    marker_token = _cancel_marker.set(marker)
    try:
        yield
    finally:
        _cancel_probe.reset(probe_token)
        _cancel_marker.reset(marker_token)


def assert_run_writable() -> None:
    probe = _cancel_probe.get()
    if probe is not None and probe():
        raise asyncio.CancelledError("Creator run was stopped before commit.")


def current_cancel_marker(project_root: Path) -> str | None:
    marker = _cancel_marker.get()
    if marker is None:
        return None
    return marker.relative_to(project_root.resolve()).as_posix()
