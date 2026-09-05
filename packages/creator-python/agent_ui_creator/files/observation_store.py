from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import TypeVar

from .state import CreatorFileState, read_creator_file_state, resolve_creator_project_file


T = TypeVar("T")


@dataclass(frozen=True, slots=True)
class CreatorFileObservation:
    run_id: str
    path: str
    exists: bool
    hash: str


class CreatorFileObservationError(RuntimeError):
    def __init__(self, code: str, file_path: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.file_path = file_path


class CreatorFileObservationStore:
    def __init__(self, project_root: str | Path) -> None:
        self.project_root = Path(project_root).resolve()
        self._observations: dict[str, CreatorFileObservation] = {}
        self.run_id = "unstarted"

    def begin(self, run_id: str) -> None:
        self.run_id = run_id
        self._observations.clear()

    def _record(self, file_path: str, state: CreatorFileState) -> CreatorFileObservation:
        path = resolve_creator_project_file(self.project_root, file_path).receipt_path
        observation = CreatorFileObservation(
            run_id=self.run_id, path=path, exists=state.exists, hash=state.hash
        )
        self._observations[path] = observation
        return observation

    def observe(self, file_path: str) -> CreatorFileObservation:
        return self._record(
            file_path, read_creator_file_state(self.project_root, file_path)
        )

    def observe_stable_read(
        self,
        file_path: str,
        read: Callable[[], T],
        succeeded: Callable[[T], bool],
    ) -> T:
        before = read_creator_file_state(self.project_root, file_path)
        result = read()
        after = read_creator_file_state(self.project_root, file_path)
        if before.exists != after.exists or before.hash != after.hash:
            raise CreatorFileObservationError(
                "stale-version",
                file_path,
                f"stale-version: {file_path} changed while Creator was reading it. Read it again.",
            )
        if succeeded(result) or not after.exists:
            self._record(file_path, after)
        return result

    def get(self, file_path: str) -> CreatorFileObservation | None:
        path = resolve_creator_project_file(self.project_root, file_path).receipt_path
        return self._observations.get(path)

    def assert_fresh_for_edit(self, file_path: str) -> CreatorFileState:
        observation = self.get(file_path)
        if observation is None or not observation.exists:
            raise CreatorFileObservationError(
                "read-before-edit",
                file_path,
                f"read-before-edit: Read {file_path} successfully in this run before editing it.",
            )
        return self._assert_fresh(file_path, observation, "editing")

    def assert_fresh_for_write(self, file_path: str) -> CreatorFileState:
        current = read_creator_file_state(self.project_root, file_path)
        observation = self.get(file_path)
        if not current.exists and observation is None:
            return current
        if observation is None:
            raise CreatorFileObservationError(
                "read-before-write",
                file_path,
                f"read-before-write: Read existing file {file_path} successfully in this run before overwriting it.",
            )
        if observation.exists != current.exists or observation.hash != current.hash:
            raise CreatorFileObservationError(
                "stale-version",
                file_path,
                f"stale-version: {file_path} changed after Creator observed it. Read it again before writing.",
            )
        return current

    def _assert_fresh(
        self,
        file_path: str,
        observation: CreatorFileObservation,
        operation: str,
    ) -> CreatorFileState:
        current = read_creator_file_state(self.project_root, file_path)
        if observation.exists != current.exists or observation.hash != current.hash:
            raise CreatorFileObservationError(
                "stale-version",
                file_path,
                f"stale-version: {file_path} changed after Creator observed it. Read it again before {operation}.",
            )
        return current
