from __future__ import annotations

import difflib
import hashlib
import json
from pathlib import Path

from langchain_core.tools import BaseTool, tool

from ..activity import CreatorActivityRecorder
from ..files import read_creator_file_state
from ..project_paths import agent_ui_source_root
from ..transactions import CreatorTransactionError, CreatorTransactionStore
from ..transactions.models import CreatorTransactionRecord


RECOVERY_READ_TOOL_NAMES = (
    "inspect_creator_transactions",
    "inspect_creator_transaction",
    "inspect_creator_transaction_change",
    "inspect_creator_baseline",
)
RECOVERY_WRITE_TOOL_NAMES = ("undo_creator_run",)
_PAGE_SIZE = 20
_DETAIL_LIMIT = 6000


def _result(**values: object) -> str:
    return json.dumps(values, ensure_ascii=False, separators=(",", ":"))


def _record_digest(record: CreatorTransactionRecord) -> str:
    # Include the saved content, not just paths and line counts. A replaced
    # transaction invalidates every observation issued for its old contents.
    source = json.dumps(record.to_dict(), ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


class CreatorRecoveryQueries:
    def __init__(self, project_root: str | Path,
                 activity: CreatorActivityRecorder | None = None) -> None:
        self.activity = activity
        self.store = activity.transactions if activity is not None else CreatorTransactionStore(project_root)
        self.observed: dict[str, str] = {}
        self.coverage: dict[tuple[str, str], set[int]] = {}

    def list(self) -> dict[str, object]:
        directory = self.store.project_root / ".agentuicreator/transactions"
        if not directory.exists():
            return {"status": "evidence_missing", "transactions": [],
                    "association": "unavailable"}
        if not directory.resolve().is_relative_to(self.store.project_root):
            return {"status": "query_error", "error": "CREATOR_TRANSACTION_INVALID"}
        transactions: list[dict[str, object]] = []
        try:
            for path in directory.glob("*.json"):
                if path.is_symlink() or not path.resolve().is_relative_to(directory.resolve()):
                    raise CreatorTransactionError("CREATOR_TRANSACTION_INVALID", "Transaction path leaves the project.")
                # The store validates the record and every controlled path.
                raw = json.loads(path.read_text(encoding="utf-8"))
                if not isinstance(raw, dict):
                    raise CreatorTransactionError("CREATOR_TRANSACTION_INVALID", "Transaction record is invalid.")
                run_id = raw.get("runId")
                if not isinstance(run_id, str) or self.store._file_name(run_id) != path.name:
                    raise CreatorTransactionError("CREATOR_TRANSACTION_INVALID", "Transaction lookup key is invalid.")
                record = self.store.load(run_id)
                transactions.append({"runId": run_id, "createdAt": record.created_at,
                                     "fileCount": len(record.files)})
        except (OSError, ValueError, CreatorTransactionError) as error:
            return {"status": "query_error", "error": getattr(error, "code", type(error).__name__)}
        transactions.sort(key=lambda item: (str(item["createdAt"]), str(item["runId"])), reverse=True)
        return {"status": "available" if transactions else "evidence_missing",
                "transactions": transactions[:100], "truncated": len(transactions) > 100,
                "association": "unavailable"}

    def inspect(self, run_id: str, *, page: int = 1) -> dict[str, object]:
        if page < 1:
            return {"status": "query_error", "error": "INVALID_PAGE"}
        try:
            record = self.store.load(run_id)
            status = self.store.status(run_id)
        except CreatorTransactionError as error:
            return {"status": "evidence_missing" if error.code == "CREATOR_TRANSACTION_NOT_FOUND" else "query_error",
                    "error": error.code}
        digest = _record_digest(record)
        total = len(record.files)
        start = (page - 1) * _PAGE_SIZE
        # Full scope is small (at most 500 files) and independent of the
        # paginated details. Only this complete manifest grants observation.
        scope = [{"path": file.path, "status": file.status,
                  "beforeHash": file.before.hash, "afterHash": file.after.hash}
                 for file in record.files]
        if start >= total:
            return {"status": "query_error", "error": "PAGE_OUT_OF_RANGE"}
        page_count = (total + _PAGE_SIZE - 1) // _PAGE_SIZE
        pages = self.coverage.setdefault((run_id, digest), set())
        pages.add(page)
        complete = len(pages) == page_count
        if complete:
            self.observed[run_id] = digest
        return {"status": "available", "runId": run_id,
                "transactionId": digest, "scopeComplete": complete,
                "fileCount": total, "observedPages": len(pages),
                "page": page, "pageCount": page_count,
                "files": scope[start:start + _PAGE_SIZE],
                "undoable": status.undoable, "conflicts": [item.to_dict() for item in status.conflicts],
                "association": "unavailable"}

    def change(self, run_id: str, path: str) -> dict[str, object]:
        try:
            record = self.store.load(run_id)
        except CreatorTransactionError as error:
            return {"status": "evidence_missing" if error.code == "CREATOR_TRANSACTION_NOT_FOUND" else "query_error",
                    "error": error.code}
        file = next((item for item in record.files if item.path == path), None)
        if file is None:
            return {"status": "evidence_missing", "error": "PATH_NOT_IN_TRANSACTION"}
        if file.after.exists and file.after.content is None:
            return {"status": "partial_coverage", "reason": "after_content_not_saved",
                    "beforeHash": file.before.hash, "afterHash": file.after.hash}
        diff = "".join(difflib.unified_diff(
            (file.before.content or "").splitlines(keepends=True),
            (file.after.content or "").splitlines(keepends=True),
            fromfile="before", tofile="after", n=2,
        ))
        return {"status": "available", "runId": run_id, "path": path,
                "transactionId": _record_digest(record), "diff": diff[:_DETAIL_LIMIT],
                "truncated": len(diff) > _DETAIL_LIMIT}

    def _source_lock_candidates(self, path: str) -> tuple[str, list[dict[str, object]]]:
        """Read only the Host's recorded source hashes, never a fresh template."""
        try:
            project_config = read_creator_file_state(
                self.store.project_root, ".agent-ui/project.json"
            )
            if not project_config.exists:
                return "evidence_missing", []
            source_root = agent_ui_source_root(self.store.project_root)
            state = read_creator_file_state(
                self.store.project_root, ".agent-ui/source-lock.json"
            )
            if not state.exists or state.content is None:
                return "evidence_missing", []
            if len(state.content.encode("utf-8")) > 5_000_000:
                return "query_error", []
            lock = json.loads(state.content)
            if not isinstance(lock, dict) or lock.get("sourceRoot") != source_root:
                return "query_error", []
            items = lock.get("items")
            if not isinstance(items, dict):
                return "query_error", []
            candidates: list[dict[str, object]] = []
            for item_id, item in items.items():
                if not isinstance(item_id, str) or not isinstance(item, dict):
                    return "query_error", []
                files = item.get("files")
                if not isinstance(files, dict):
                    return "query_error", []
                for relative, metadata in files.items():
                    if (isinstance(relative, str)
                            and f"{source_root}/{relative}" == path
                            and isinstance(metadata, dict)
                            and isinstance(metadata.get("sha256"), str)
                            and len(metadata["sha256"]) == 64
                            and all(character in "0123456789abcdef" for character in metadata["sha256"])):
                        candidates.append({"itemId": item_id,
                                           "version": item.get("version"),
                                           "sourceHash": metadata["sha256"]})
            return "available" if candidates else "evidence_missing", candidates
        except (OSError, ValueError, CreatorTransactionError):
            return "query_error", []

    def baseline(self, path: str, *, run_id: str | None = None) -> dict[str, object]:
        # A sourceRoot is a location, never proof of an original version.
        # Saved before states are the only content source exposed here.
        listing = self.list()
        if listing["status"] == "query_error":
            return listing
        lock_status, source_candidates = self._source_lock_candidates(path)
        candidates = ([run_id] if run_id is not None else
                      [str(item["runId"]) for item in listing["transactions"]])
        found = []
        missing_run_id = None
        for candidate in candidates:
            try:
                record = self.store.load(candidate)
            except CreatorTransactionError as error:
                if error.code == "CREATOR_TRANSACTION_NOT_FOUND":
                    missing_run_id = candidate
                    continue
                return {"status": "query_error", "error": error.code}
            for file in record.files:
                if file.path == path:
                    found.append({"runId": candidate, "beforeHash": file.before.hash,
                                  "beforeExists": file.before.exists,
                                  "transactionId": _record_digest(record),
                                  **({"beforeContent": file.before.content[:_DETAIL_LIMIT],
                                      "contentComplete": len(file.before.content) <= _DETAIL_LIMIT}
                                     if run_id is not None and file.before.content is not None else {})})
        source_hashes = {str(item["sourceHash"]) for item in source_candidates}
        for candidate in found:
            candidate["sourceLockMatch"] = candidate["beforeHash"] in source_hashes
        matched_content = any(candidate["sourceLockMatch"] and candidate["beforeExists"]
                              for candidate in found)
        content_partial = run_id is not None and any(
            candidate.get("contentComplete") is False for candidate in found
        )
        return {"status": "partial_coverage" if content_partial else
                "available" if found else
                "query_error" if lock_status == "query_error" else
                "partial_coverage" if source_candidates else
                "partial_coverage" if listing.get("truncated") and run_id is None else
                "evidence_missing",
                "source": "creator_transaction_before" if found else
                "source_lock_hash" if source_candidates else None,
                "candidates": found, "originalProjectBaseline": (
                    "source_lock_hash_matched_transaction_before"
                    if matched_content else "not_implemented"
                ),
                "sourceLockCandidates": source_candidates,
                "sourceLockStatus": lock_status,
                "missingTransactionRunId": missing_run_id,
                "association": "unavailable" if run_id is None else "explicit_run_id"}

    def undo(self, run_id: str, transaction_id: str,
             requested_paths: list[str]) -> dict[str, object]:
        """Undo only a fully observed transaction with an exact requested scope."""
        if self.observed.get(run_id) != transaction_id:
            return {"status": "observation_required", "error": "FULL_SCOPE_NOT_OBSERVED"}
        try:
            record = self.store.load(run_id)
            if _record_digest(record) != transaction_id:
                return {"status": "conflict", "error": "CREATOR_TRANSACTION_CHANGED"}
            paths = {file.path for file in record.files}
            if len(requested_paths) != len(paths) or set(requested_paths) != paths:
                return {"status": "scope_mismatch", "error": "PARTIAL_TRANSACTION_UNDO_UNAVAILABLE",
                        "transactionPaths": sorted(paths)}
            if self.activity is not None:
                for path in sorted(paths):
                    self.activity.capture_before(path)
            result = self.store.undo(
                run_id, expected_transaction_id=transaction_id, require_pending=True,
            )
        except CreatorTransactionError as error:
            return {"status": "already_undone" if error.code == "CREATOR_ALREADY_UNDONE" else
                    "conflict" if error.code in {"CREATOR_TRANSACTION_CHANGED", "CREATOR_UNDO_CONFLICT"} else "query_error",
                    "error": error.code}
        if self.activity is not None:
            for path in result.changed_paths:
                self.activity.file_observations.observe(path)
                self.activity.touch(path)
        return {"ok": True, "status": "undone", "runId": run_id,
                "changedPaths": list(result.changed_paths)}


def create_recovery_query_tools(queries: CreatorRecoveryQueries) -> tuple[BaseTool, ...]:
    @tool("inspect_creator_transactions")
    def inspect_creator_transactions() -> str:
        """List recorded Creator changes; recency does not identify the user's target."""
        return _result(**queries.list())

    @tool("inspect_creator_transaction")
    def inspect_creator_transaction(run_id: str, page: int = 1) -> str:
        """Inspect a complete bounded transaction scope and paged file details."""
        return _result(**queries.inspect(run_id, page=page))

    @tool("inspect_creator_transaction_change")
    def inspect_creator_transaction_change(run_id: str, path: str) -> str:
        """Read a bounded saved diff for one file in a Creator transaction."""
        return _result(**queries.change(run_id, path))

    @tool("inspect_creator_baseline")
    def inspect_creator_baseline(path: str, run_id: str | None = None) -> str:
        """Find saved before-state evidence; an original template reset is unavailable."""
        return _result(**queries.baseline(path, run_id=run_id))

    return (inspect_creator_transactions, inspect_creator_transaction,
            inspect_creator_transaction_change, inspect_creator_baseline)


def create_recovery_undo_tool(queries: CreatorRecoveryQueries) -> BaseTool:
    @tool("undo_creator_run")
    def undo_creator_run(run_id: str, transaction_id: str,
                         requested_paths: list[str]) -> str:
        """Undo an explicitly requested whole Creator run after full scope inspection. Supply exactly the paths the user requested to undo; a partial scope is rejected."""
        return _result(**queries.undo(run_id, transaction_id, requested_paths))

    return undo_creator_run
