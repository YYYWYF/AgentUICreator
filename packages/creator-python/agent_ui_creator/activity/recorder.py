from __future__ import annotations

import copy
import difflib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from ..files import CreatorFileObservationStore, read_creator_file_state, resolve_creator_project_file
from ..observability import CreatorRunLogger
from ..transactions import CreatorTransactionFileInput, CreatorTransactionStore
from .receipt import CreatorFileChangeReceipt


MAX_DIFF_CHARACTERS = 20_000
MAX_VALIDATION_OUTPUT_CHARACTERS = 8_000


def _unified_diff(file_path: str, before: str | None, after: str | None) -> tuple[str, bool]:
    source = "".join(
        difflib.unified_diff(
            [] if before is None else before.splitlines(keepends=True),
            [] if after is None else after.splitlines(keepends=True),
            fromfile="/dev/null" if before is None else f"a/{file_path}",
            tofile="/dev/null" if after is None else f"b/{file_path}",
            n=3,
        )
    ).rstrip()
    if len(source) <= MAX_DIFF_CHARACTERS:
        return source, False
    return source[:MAX_DIFF_CHARACTERS] + "\n… Diff 内容过长，已截断", True


class CreatorActivityRecorder:
    def __init__(
        self, project_root: str | Path, *, logger: CreatorRunLogger | None = None
    ) -> None:
        self.project_root = Path(project_root).resolve()
        self.logger = logger
        self.file_observations = CreatorFileObservationStore(self.project_root)
        self.transactions = CreatorTransactionStore(
            self.project_root,
            event_sink=None if logger is None else logger.record,
        )
        self._before_by_path: dict[str, str | None] = {}
        self._touched_paths: set[str] = set()
        self._created_directories: set[str] = set()
        self._validations: list[dict[str, Any]] = []
        self._revision = 0
        self._run_id = "unstarted"
        self._before_content_bytes = 0
        self._completed_receipt: dict[str, Any] | None = None
        self._last_mutation_at: datetime | None = None
        self._semantic_noop: dict[str, str] | None = None
        self._verification: dict[str, Any] = {
            "status": "not-run",
            "projectRevision": 0,
            "auditAttempts": 0,
            "checks": [],
        }

    def begin(self, run_id: str | None = None) -> None:
        self._before_by_path.clear()
        self._touched_paths.clear()
        self._created_directories.clear()
        self._validations.clear()
        self._revision = 0
        self._before_content_bytes = 0
        self._completed_receipt = None
        self._last_mutation_at = None
        self._semantic_noop = None
        self._verification = {
            "status": "not-run",
            "projectRevision": 0,
            "auditAttempts": 0,
            "checks": [],
        }
        self._run_id = run_id or str(uuid4())
        self.file_observations.begin(self._run_id)

    @property
    def run_id(self) -> str:
        return self._run_id

    @property
    def revision(self) -> int:
        return self._revision

    @property
    def last_mutation_at(self) -> datetime | None:
        return self._last_mutation_at

    @property
    def semantic_noop_satisfied(self) -> bool:
        return self._semantic_noop is not None

    @property
    def semantic_noop(self) -> dict[str, str] | None:
        return copy.deepcopy(self._semantic_noop)

    def capture_before(self, file_path: str) -> None:
        state = read_creator_file_state(self.project_root, file_path)
        self.capture_before_content(file_path, state.content)

    def capture_before_content(self, file_path: str, content: str | None) -> None:
        path = resolve_creator_project_file(self.project_root, file_path).receipt_path
        if path in self._before_by_path:
            return
        capture_payload: dict[str, str] = {"path": path}
        if content is not None:
            capture_payload["content"] = content
        additional_bytes = len(
            json.dumps(
                capture_payload,
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode("utf-8")
        )
        self.transactions.assert_capture_budget(
            self._before_content_bytes, additional_bytes, len(self._before_by_path)
        )
        self._before_by_path[path] = content
        self._before_content_bytes += additional_bytes

    def touch(self, file_path: str) -> None:
        path = resolve_creator_project_file(self.project_root, file_path).receipt_path
        self._touched_paths.add(path)
        self._revision += 1
        self._last_mutation_at = datetime.now(timezone.utc)
        if self.logger is not None:
            self.logger.record(
                "file_mutation",
                {
                    "path": path,
                    "mutationRevision": self._revision,
                    "mutatedAt": self._last_mutation_at.isoformat(
                        timespec="milliseconds"
                    ).replace("+00:00", "Z"),
                },
            )

    def record_created_directory(self, directory_path: str) -> None:
        path = resolve_creator_project_file(
            self.project_root, directory_path
        ).receipt_path
        self._created_directories.add(path)

    def record_semantic_noop(self, *, source: str, reason: str) -> None:
        self._semantic_noop = {"source": source, "reason": reason}
        if self.logger is not None:
            self.logger.record("semantic_noop", self._semantic_noop)

    def record_validation(
        self,
        command: str,
        *,
        exit_code: int | None,
        output: str,
        truncated: bool,
        revision: int | None = None,
    ) -> None:
        normalized = output.strip()
        output_truncated = truncated
        if len(normalized) > MAX_VALIDATION_OUTPUT_CHARACTERS:
            normalized = (
                normalized[:MAX_VALIDATION_OUTPUT_CHARACTERS]
                + "\n… 验证输出过长，已截断"
            )
            output_truncated = True
        validation = {
            "command": command,
            "status": "passed" if exit_code == 0 else "failed",
            "exitCode": exit_code,
            "output": normalized,
            "truncated": output_truncated,
            "revision": self._revision if revision is None else revision,
        }
        self._validations.append(validation)

    def validation_at_revision(
        self, command: str, revision: int
    ) -> dict[str, Any] | None:
        for validation in reversed(self._validations):
            if (
                validation["command"] == command
                and validation["revision"] == revision
            ):
                return copy.deepcopy(validation)
        return None

    def record_verification(self, verification: dict[str, Any]) -> None:
        self._verification = copy.deepcopy(verification)

    def snapshot(self) -> dict[str, Any]:
        receipt, _ = self._collect_receipt()
        return receipt

    def finish(self) -> dict[str, Any]:
        if self._completed_receipt is not None:
            return copy.deepcopy(self._completed_receipt)
        receipt, transaction_files = self._collect_receipt()
        transaction = self.transactions.persist_run(
            run_id=self._run_id,
            mutation_revision=self._revision,
            validation_revision=(
                self._revision
                if any(
                    validation["revision"] == self._revision
                    for validation in self._validations
                )
                else None
            ),
            files=transaction_files,
            created_directories=sorted(self._created_directories),
        )
        if transaction is not None:
            status = self.transactions.status(transaction.run_id)
            receipt["transaction"] = {
                "runId": transaction.run_id,
                "undoable": status.undoable,
            }
        diagnostic_log = self.logger.reference() if self.logger is not None else None
        if diagnostic_log is not None:
            receipt["diagnosticLog"] = diagnostic_log
        self._completed_receipt = copy.deepcopy(receipt)
        return copy.deepcopy(receipt)

    def _collect_receipt(
        self,
    ) -> tuple[dict[str, Any], tuple[CreatorTransactionFileInput, ...]]:
        files: list[CreatorFileChangeReceipt] = []
        transaction_files: list[CreatorTransactionFileInput] = []
        for file_path in sorted(self._touched_paths):
            after = read_creator_file_state(self.project_root, file_path).content
            before = self._before_by_path.get(file_path)
            if before == after:
                continue
            diff, truncated = _unified_diff(file_path, before, after)
            status = (
                "created" if before is None else "deleted" if after is None else "modified"
            )
            files.append(CreatorFileChangeReceipt(file_path, status, diff, truncated))
            transaction_files.append(
                CreatorTransactionFileInput(file_path, before, after)
            )
        verification = copy.deepcopy(self._verification)
        if verification.get("status") == "not-run":
            verification["projectRevision"] = self._revision
        receipt: dict[str, Any] = {
            "files": [file.to_dict() for file in files],
            "validations": copy.deepcopy(self._validations),
            "verification": verification,
        }
        if self._semantic_noop is not None:
            receipt["semanticNoop"] = copy.deepcopy(self._semantic_noop)
        return receipt, tuple(transaction_files)
