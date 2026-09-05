from __future__ import annotations

import hashlib
import json
import threading
from collections.abc import Callable, Mapping, Sequence
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..files import (
    CREATOR_MISSING_FILE_HASH,
    CreatorFileState,
    CreatorFileStateConflictError,
    create_creator_file_atomically,
    creator_content_hash,
    read_creator_file_state,
    remove_creator_file,
    replace_creator_file_atomically,
    resolve_creator_project_file,
)
from .errors import CreatorTransactionError
from .models import (
    CreatorTransactionConflict,
    CreatorTransactionFileInput,
    CreatorTransactionFileRecord,
    CreatorTransactionFileState,
    CreatorTransactionRecord,
    CreatorTransactionStatus,
    CreatorUndoResult,
)


CREATOR_TRANSACTION_SCHEMA_VERSION = 1
CREATOR_TRANSACTION_DIRECTORY = ".agentuicreator/transactions"
MAX_CREATOR_TRANSACTION_BYTES = 5_000_000
MAX_CREATOR_TRANSACTION_FILES = 500
TRANSACTION_CONTENT_RESERVE_BYTES = 128_000
_HASH_LENGTH = 64

EventSink = Callable[[str, Mapping[str, object]], None]
_undo_locks_guard = threading.Lock()
_undo_locks: dict[str, threading.Lock] = {}


def _undo_lock(project_root: Path) -> threading.Lock:
    key = str(project_root.resolve())
    with _undo_locks_guard:
        return _undo_locks.setdefault(key, threading.Lock())


def _invalid(message: str) -> CreatorTransactionError:
    return CreatorTransactionError("CREATOR_TRANSACTION_INVALID", message)


def _required_string(value: Any, label: str) -> str:
    if not isinstance(value, str):
        raise _invalid(f"{label} must be a string.")
    return value


def _required_revision(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise _invalid(f"{label} must be a non-negative integer.")
    return value


def _file_state(
    value: Any, label: str, *, include_content: bool
) -> CreatorTransactionFileState:
    if not isinstance(value, dict):
        raise _invalid(f"{label} must be an object.")
    exists = value.get("exists")
    digest = value.get("hash")
    if not isinstance(exists, bool):
        raise _invalid(f"{label}.exists must be a boolean.")
    if (
        not isinstance(digest, str)
        or len(digest) != _HASH_LENGTH
        or any(character not in "0123456789abcdef" for character in digest)
    ):
        raise _invalid(f"{label}.hash is invalid.")
    content = value.get("content")
    if include_content and exists and not isinstance(content, str):
        raise _invalid(f"{label}.content is required for an existing before state.")
    if (not exists or not include_content) and "content" in value:
        raise _invalid(f"{label}.content is not allowed for this state.")
    actual_hash = (
        creator_content_hash(content)
        if exists and include_content
        else CREATOR_MISSING_FILE_HASH if not exists else None
    )
    if actual_hash is not None and actual_hash != digest:
        raise _invalid(f"{label}.hash does not match its state.")
    return CreatorTransactionFileState(exists, digest, content if exists else None)


def parse_transaction_record(
    value: Any, *, expected_run_id: str | None = None
) -> CreatorTransactionRecord:
    if not isinstance(value, dict) or value.get("schemaVersion") != 1:
        raise _invalid("Creator transaction schema is invalid.")
    run_id = _required_string(value.get("runId"), "transaction.runId")
    if expected_run_id is not None and run_id != expected_run_id:
        raise _invalid("Creator transaction runId does not match its lookup key.")
    raw_files = value.get("files")
    if not isinstance(raw_files, list) or not raw_files:
        raise _invalid("Creator transaction files must be a non-empty array.")
    if len(raw_files) > MAX_CREATOR_TRANSACTION_FILES:
        raise CreatorTransactionError(
            "CREATOR_TRANSACTION_TOO_LARGE",
            f"Creator transaction exceeds {MAX_CREATOR_TRANSACTION_FILES} files.",
        )

    files: list[CreatorTransactionFileRecord] = []
    for index, raw_file in enumerate(raw_files):
        label = f"transaction.files[{index}]"
        if not isinstance(raw_file, dict):
            raise _invalid(f"{label} must be an object.")
        path = _required_string(raw_file.get("path"), f"{label}.path")
        status = raw_file.get("status")
        if status not in {"created", "modified", "deleted"}:
            raise _invalid(f"{label}.status is invalid.")
        before = _file_state(raw_file.get("before"), f"{label}.before", include_content=True)
        after = _file_state(raw_file.get("after"), f"{label}.after", include_content=False)
        expected_status = (
            "created"
            if not before.exists and after.exists
            else "deleted"
            if before.exists and not after.exists
            else "modified"
            if before.exists and after.exists
            else None
        )
        if status != expected_status:
            raise _invalid(f"{label}.status does not match its states.")
        files.append(CreatorTransactionFileRecord(path, status, before, after))

    if len({file.path for file in files}) != len(files):
        raise _invalid("Creator transaction contains duplicate file paths.")
    validation_revision = value.get("validationRevision")
    if validation_revision is not None:
        validation_revision = _required_revision(
            validation_revision, "transaction.validationRevision"
        )
    return CreatorTransactionRecord(
        schema_version=CREATOR_TRANSACTION_SCHEMA_VERSION,
        run_id=run_id,
        created_at=_required_string(value.get("createdAt"), "transaction.createdAt"),
        mutation_revision=_required_revision(
            value.get("mutationRevision"), "transaction.mutationRevision"
        ),
        validation_revision=validation_revision,
        files=tuple(files),
    )


def _state_from_content(content: str | None) -> CreatorTransactionFileState:
    if content is None:
        return CreatorTransactionFileState(False, CREATOR_MISSING_FILE_HASH)
    return CreatorTransactionFileState(True, creator_content_hash(content), content)


class CreatorTransactionStore:
    def __init__(
        self, project_root: str | Path, *, event_sink: EventSink | None = None
    ) -> None:
        self.project_root = Path(project_root).resolve()
        self.event_sink = event_sink

    def _record(self, event: str, data: Mapping[str, object]) -> None:
        if self.event_sink is not None:
            self.event_sink(event, data)

    @staticmethod
    def assert_capture_budget(
        current_content_bytes: int,
        additional_content_bytes: int,
        observed_file_count: int,
    ) -> None:
        if observed_file_count >= MAX_CREATOR_TRANSACTION_FILES:
            raise CreatorTransactionError(
                "CREATOR_TRANSACTION_TOO_LARGE",
                f"Creator run cannot capture more than {MAX_CREATOR_TRANSACTION_FILES} files for safe undo.",
            )
        if (
            current_content_bytes + additional_content_bytes
            > MAX_CREATOR_TRANSACTION_BYTES - TRANSACTION_CONTENT_RESERVE_BYTES
        ):
            raise CreatorTransactionError(
                "CREATOR_TRANSACTION_TOO_LARGE",
                f"Creator run before-state content exceeds the {MAX_CREATOR_TRANSACTION_BYTES} byte transaction limit.",
            )

    def persist_run(
        self,
        *,
        run_id: str,
        mutation_revision: int,
        validation_revision: int | None,
        files: Sequence[CreatorTransactionFileInput],
    ) -> CreatorTransactionRecord | None:
        changed = sorted(
            (file for file in files if file.before != file.after),
            key=lambda file: file.path,
        )
        if not changed:
            return None
        records: list[CreatorTransactionFileRecord] = []
        for file in changed:
            location = resolve_creator_project_file(self.project_root, file.path)
            before = _state_from_content(file.before)
            after = _state_from_content(file.after)
            status = (
                "created"
                if file.before is None
                else "deleted"
                if file.after is None
                else "modified"
            )
            records.append(
                CreatorTransactionFileRecord(
                    location.receipt_path,
                    status,
                    before,
                    CreatorTransactionFileState(after.exists, after.hash),
                )
            )
        record = CreatorTransactionRecord(
            CREATOR_TRANSACTION_SCHEMA_VERSION,
            run_id,
            datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            mutation_revision,
            validation_revision,
            tuple(records),
        )
        source = json.dumps(
            record.to_dict(), ensure_ascii=False, indent=2, separators=(",", ": ")
        ) + "\n"
        if len(source.encode("utf-8")) > MAX_CREATOR_TRANSACTION_BYTES:
            raise CreatorTransactionError(
                "CREATOR_TRANSACTION_TOO_LARGE",
                f"Creator transaction exceeds {MAX_CREATOR_TRANSACTION_BYTES} bytes.",
            )
        self._ensure_directory()
        replace_creator_file_atomically(
            self.project_root, self._relative_path(run_id), source
        )
        self._record(
            "transaction_persisted",
            {
                "runId": run_id,
                "mutationRevision": mutation_revision,
                "changedPaths": [file.path for file in records],
            },
        )
        return record

    def load(self, run_id: str) -> CreatorTransactionRecord:
        try:
            state = read_creator_file_state(self.project_root, self._relative_path(run_id))
        except FileNotFoundError as error:
            raise CreatorTransactionError(
                "CREATOR_TRANSACTION_NOT_FOUND",
                f'No Creator transaction exists for run "{run_id}".',
            ) from error
        if not state.exists or state.content is None:
            raise CreatorTransactionError(
                "CREATOR_TRANSACTION_NOT_FOUND",
                f'No Creator transaction exists for run "{run_id}".',
            )
        payload = state.content.encode("utf-8")
        if len(payload) > MAX_CREATOR_TRANSACTION_BYTES:
            raise CreatorTransactionError(
                "CREATOR_TRANSACTION_TOO_LARGE",
                f"Creator transaction exceeds {MAX_CREATOR_TRANSACTION_BYTES} bytes.",
            )
        try:
            record = parse_transaction_record(
                json.loads(payload.decode("utf-8")), expected_run_id=run_id
            )
            self._assert_record_paths(record)
            return record
        except CreatorTransactionError:
            raise
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise CreatorTransactionError(
                "CREATOR_TRANSACTION_INVALID",
                f'Creator transaction for run "{run_id}" is invalid.',
                {"cause": str(error)},
            ) from error

    def status(self, run_id: str) -> CreatorTransactionStatus:
        record = self.load(run_id)
        conflicts: list[CreatorTransactionConflict] = []
        for file in record.files:
            current = read_creator_file_state(self.project_root, file.path)
            if current.exists != file.after.exists or current.hash != file.after.hash:
                conflicts.append(
                    CreatorTransactionConflict(file.path, file.after.hash, current.hash)
                )
        return CreatorTransactionStatus(run_id, not conflicts, tuple(conflicts))

    def latest_undoable(
        self, exclude_run_id: str | None = None
    ) -> CreatorTransactionRecord:
        directory = self.project_root / CREATOR_TRANSACTION_DIRECTORY
        records: list[CreatorTransactionRecord] = []
        if directory.exists():
            try:
                directory.resolve(strict=True).relative_to(
                    self.project_root.resolve(strict=True)
                )
            except ValueError as error:
                raise CreatorTransactionError(
                    "CREATOR_TRANSACTION_INVALID",
                    "Creator transaction directory leaves the project.",
                ) from error
            for candidate in directory.glob("*.json"):
                state = read_creator_file_state(
                    self.project_root,
                    f"{CREATOR_TRANSACTION_DIRECTORY}/{candidate.name}",
                )
                payload = (state.content or "").encode("utf-8")
                if len(payload) > MAX_CREATOR_TRANSACTION_BYTES:
                    raise CreatorTransactionError(
                        "CREATOR_TRANSACTION_TOO_LARGE",
                        f"Creator transaction exceeds {MAX_CREATOR_TRANSACTION_BYTES} bytes.",
                    )
                try:
                    record = parse_transaction_record(json.loads(payload.decode("utf-8")))
                    self._assert_record_paths(record)
                except (UnicodeDecodeError, json.JSONDecodeError) as error:
                    raise CreatorTransactionError(
                        "CREATOR_TRANSACTION_INVALID",
                        f"Creator transaction {candidate.name} is invalid.",
                    ) from error
                if record.run_id != exclude_run_id:
                    records.append(record)
        for record in sorted(records, key=lambda item: item.created_at, reverse=True):
            if self.status(record.run_id).undoable:
                return record
        raise CreatorTransactionError(
            "CREATOR_TRANSACTION_NOT_FOUND", "No undoable Creator run is available."
        )

    def undo(
        self,
        requested_run_id: str | None = None,
        *,
        simulate_failure_after_write: int | None = None,
    ) -> CreatorUndoResult:
        with _undo_lock(self.project_root):
            record = (
                self.latest_undoable()
                if requested_run_id is None
                else self.load(requested_run_id)
            )
            current_states, conflicts = self._preflight(record)
            if conflicts:
                raise CreatorTransactionError(
                    "CREATOR_UNDO_CONFLICT",
                    f'Creator run "{record.run_id}" cannot be undone because project files changed afterward.',
                    {"conflicts": [conflict.to_dict() for conflict in conflicts]},
                )
            _, conflicts = self._preflight(record)
            if conflicts:
                raise CreatorTransactionError(
                    "CREATOR_UNDO_CONFLICT",
                    f'Creator run "{record.run_id}" changed during undo preflight.',
                    {"conflicts": [conflict.to_dict() for conflict in conflicts]},
                )

            applied: list[CreatorTransactionFileRecord] = []
            try:
                for file in record.files:
                    expected = current_states[file.path]
                    if file.before.exists:
                        replace_creator_file_atomically(
                            self.project_root,
                            file.path,
                            file.before.content or "",
                            expected,
                        )
                    else:
                        remove_creator_file(self.project_root, file.path, expected)
                    applied.append(file)
                    if simulate_failure_after_write == len(applied):
                        raise RuntimeError("Simulated Creator undo failure")
            except BaseException as error:
                try:
                    for file in reversed(applied):
                        original = current_states[file.path]
                        reverted = (
                            CreatorFileState(
                                True, file.before.hash, file.before.content
                            )
                            if file.before.exists
                            else CreatorFileState(False, CREATOR_MISSING_FILE_HASH)
                        )
                        if original.exists:
                            replace_creator_file_atomically(
                                self.project_root,
                                file.path,
                                original.content or "",
                                reverted,
                            )
                        else:
                            remove_creator_file(self.project_root, file.path, reverted)
                except BaseException as rollback_error:
                    raise CreatorTransactionError(
                        "CREATOR_UNDO_ROLLBACK_FAILED",
                        f'Creator run "{record.run_id}" undo failed and rollback was incomplete.',
                        {"cause": str(error), "rollbackCause": str(rollback_error)},
                    ) from rollback_error
                raise
            changed_paths = tuple(sorted(file.path for file in record.files))
            self._record(
                "undo", {"runId": record.run_id, "changedPaths": list(changed_paths)}
            )
            return CreatorUndoResult(record.run_id, changed_paths, record)

    def _preflight(
        self, record: CreatorTransactionRecord
    ) -> tuple[dict[str, CreatorFileState], tuple[CreatorTransactionConflict, ...]]:
        states: dict[str, CreatorFileState] = {}
        conflicts: list[CreatorTransactionConflict] = []
        for file in record.files:
            current = read_creator_file_state(self.project_root, file.path)
            states[file.path] = current
            if current.exists != file.after.exists or current.hash != file.after.hash:
                conflicts.append(
                    CreatorTransactionConflict(file.path, file.after.hash, current.hash)
                )
        return states, tuple(conflicts)

    @staticmethod
    def _file_name(run_id: str) -> str:
        return hashlib.sha256(run_id.encode("utf-8")).hexdigest() + ".json"

    def _relative_path(self, run_id: str) -> str:
        return f"{CREATOR_TRANSACTION_DIRECTORY}/{self._file_name(run_id)}"

    def _ensure_directory(self) -> None:
        try:
            create_creator_file_atomically(
                self.project_root, ".agentuicreator/.gitignore", "*\n"
            )
        except CreatorFileStateConflictError:
            pass

    def _assert_record_paths(self, record: CreatorTransactionRecord) -> None:
        for file in record.files:
            try:
                location = resolve_creator_project_file(self.project_root, file.path)
            except ValueError as error:
                raise CreatorTransactionError(
                    "CREATOR_TRANSACTION_INVALID",
                    f'Creator transaction path "{file.path}" is invalid.',
                ) from error
            if location.receipt_path != file.path:
                raise CreatorTransactionError(
                    "CREATOR_TRANSACTION_INVALID",
                    f'Creator transaction path "{file.path}" is not canonical.',
                )
