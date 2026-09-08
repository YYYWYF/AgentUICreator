from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from ..activity import CreatorActivityRecorder
from ..files import CreatorFileState, read_creator_file_state


@dataclass(frozen=True, slots=True)
class ServiceContractResidualState:
    path: str
    before: CreatorFileState
    current: CreatorFileState
    changed: bool


def reconcile_service_contract_residual(
    *,
    project_root: str | Path,
    activity: CreatorActivityRecorder,
    path: str,
    before: CreatorFileState,
    created_directories: Iterable[Path] = (),
) -> ServiceContractResidualState:
    """Record rollback residuals from disk without attempting another rollback."""

    current = read_creator_file_state(project_root, path)
    changed = current.exists != before.exists or current.hash != before.hash
    state = ServiceContractResidualState(path, before, current, changed)
    if not changed:
        return state

    activity.capture_before_content(path, before.content if before.exists else None)
    activity.file_observations.observe(path)
    activity.touch(path)
    root = Path(project_root).resolve()
    for directory in sorted(created_directories, key=lambda item: len(item.parts)):
        if directory.is_dir() and not directory.is_symlink():
            activity.record_created_directory(directory.relative_to(root).as_posix())
    return state
