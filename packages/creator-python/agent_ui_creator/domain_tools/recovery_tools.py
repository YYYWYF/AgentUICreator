from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
import difflib
import hashlib
import json
import threading
from pathlib import Path

from langchain_core.tools import BaseTool, tool

from ..activity import CreatorActivityRecorder
from ..files import read_creator_file_state
from ..project_paths import agent_ui_source_root
from ..resource_scope import change_layers_for_paths
from ..run_control import CreatorRunControlState
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


@dataclass(slots=True)
class RecoveryInspectionState:
    run_id: str
    transaction_id: str
    summary_seen: bool = False
    scope_complete: bool = False
    conflict_checked: bool = False
    selected_paths: tuple[str, ...] = ()


@dataclass(slots=True)
class RecoveryEvidence:
    inspected_transactions: dict[str, RecoveryInspectionState] = field(default_factory=dict)
    status: str = "inactive"
    reason: str | None = None
    recovery_mutation_count: int = 0
    recovered_states: dict[str, str] = field(default_factory=dict)
    recovered_transactions: dict[str, str] = field(default_factory=dict)
    transactions_inspected: int = 0
    transaction_details_read: int = 0
    transaction_changes_read: int = 0
    undo_attempts: int = 0
    duplicate_recovery_calls: int = 0
    final_state: str = "inactive"

    def to_dict(self) -> dict[str, object]:
        return {
            "transactionsInspected": self.transactions_inspected,
            "transactionDetailsRead": self.transaction_details_read,
            "transactionChangesRead": self.transaction_changes_read,
            "undoAttempts": self.undo_attempts,
            "duplicateRecoveryCalls": self.duplicate_recovery_calls,
            "finalState": self.final_state,
            "reason": self.reason,
        }


class CreatorRecoveryQueries:
    def __init__(self, project_root: str | Path,
                 activity: CreatorActivityRecorder | None = None,
                 run_control: CreatorRunControlState | None = None) -> None:
        self.activity = activity
        self.store = activity.transactions if activity is not None else CreatorTransactionStore(project_root)
        self.run_control = run_control
        self.evidence = RecoveryEvidence()
        self._run_id = None if activity is None else activity.run_id
        self._call_lock = threading.RLock()
        self._successful_calls: dict[str, tuple[object, dict[str, object]]] = {}
        self.coverage: dict[tuple[str, str], set[int]] = {}

    def _ensure_run(self) -> None:
        if self.activity is not None and self._run_id != self.activity.run_id:
            self._run_id = self.activity.run_id
            self.evidence = RecoveryEvidence()
            self.coverage.clear()
            self._successful_calls.clear()

    def _inspection(self, record: CreatorTransactionRecord) -> RecoveryInspectionState:
        digest = _record_digest(record)
        state = self.evidence.inspected_transactions.get(record.run_id)
        if state is None or state.transaction_id != digest:
            state = RecoveryInspectionState(record.run_id, digest)
            self.evidence.inspected_transactions[record.run_id] = state
        return state

    def _recovery_status(self, record: CreatorTransactionRecord) -> dict[str, object]:
        status = self.store.status(record.run_id)
        already_undone = read_creator_file_state(
            self.store.project_root, self.store._undo_marker_path(record.run_id)
        ).exists
        conflicts = [conflict.to_dict() for conflict in status.conflicts]
        if already_undone:
            # A marker is not proof that subsequent user edits still match
            # the restored state. Report before-state conflicts explicitly.
            conflicts = []
            for file in record.files:
                current = read_creator_file_state(self.store.project_root, file.path)
                if current.exists != file.before.exists or current.hash != file.before.hash:
                    conflicts.append({"path": file.path, "expectedHash": file.before.hash,
                                      "actualHash": current.hash})
        return {"undoable": status.undoable and not already_undone, "alreadyUndone": already_undone,
                "beforeStateMatches": not conflicts if already_undone else None,
                "conflicts": conflicts}

    def _call_token(self, result: dict[str, object]) -> object:
        # Duplicates reuse evidence only while both history and current files
        # are unchanged. This token never grants permission to undo.
        run_ids = ([str(item["runId"]) for item in result["transactions"]]
                   if "transactions" in result else [str(result["runId"])])
        tokens = []
        for run_id in run_ids:
            record = self.store.load(run_id)
            tokens.append((_record_digest(record), tuple(
                read_creator_file_state(self.store.project_root, file.path).hash
                for file in record.files
            ), read_creator_file_state(
                self.store.project_root, self.store._undo_marker_path(run_id)
            ).hash))
        if "transactions" in result:
            directory = self.store.project_root / ".agentuicreator/transactions"
            tokens.append(tuple(sorted((path.name, path.stat().st_mtime_ns, path.stat().st_size)
                                       for path in directory.glob("*.json"))))
        return tuple(tokens)

    def _call(self, name: str, args: dict[str, object],
              execute: Callable[[], dict[str, object]], counter: str) -> dict[str, object]:
        # LangChain may dispatch synchronous tools on separate worker threads.
        # Serialize observation/check/execute/cache so duplicate undo is guarded.
        with self._call_lock:
            return self._execute_call(name, args, execute, counter)

    def _execute_call(self, name: str, args: dict[str, object],
                      execute: Callable[[], dict[str, object]], counter: str) -> dict[str, object]:
        self._ensure_run()
        key = json.dumps([name, args], sort_keys=True)
        cached = self._successful_calls.get(key)
        if cached is not None:
            try:
                unchanged = cached[0] == self._call_token(cached[1])
            except (OSError, ValueError, CreatorTransactionError):
                unchanged = False
            if unchanged:
                self.evidence.duplicate_recovery_calls += 1
                return {"status": "already_observed", "error": "RECOVERY_ALREADY_OBSERVED",
                        "tool": name, "arguments": args, "reusePreviousResult": True,
                        **({"completion": cached[1]["completion"]} if "completion" in cached[1] else {}),
                        "nextAction": "validate_current_revision" if self.evidence.status in {
                            "recovered", "already_recovered"} else "reuse_previous_result"}
        setattr(self.evidence, counter, getattr(self.evidence, counter) + 1)
        if self.evidence.status == "inactive":
            self.evidence.status = "needs_user_input"
            self.evidence.final_state = "needs_user_input"
            self.evidence.reason = "missing_recovery_evidence"
        result = execute()
        if result.get("status") in {"available", "undone", "already_undone"}:
            try:
                self._successful_calls[key] = (self._call_token(result), result)
            except (OSError, ValueError, CreatorTransactionError):
                pass
        return result

    def list(self, *, offset: int = 0, limit: int = _PAGE_SIZE) -> dict[str, object]:
        def execute() -> dict[str, object]:
            if offset < 0 or not 1 <= limit <= _PAGE_SIZE:
                return {"status": "query_error", "error": "INVALID_PAGINATION"}
            result = self._list()
            if result["status"] == "query_error":
                return result
            records = result["transactions"]
            selected = records[offset:offset + limit]
            summaries = []
            for item in selected:
                record = self.store.load(str(item["runId"]))
                status = self._recovery_status(record)
                state = self._inspection(record)
                state.summary_seen = True
                state.conflict_checked = True
                paths = [file.path for file in record.files]
                layers = change_layers_for_paths(paths, project_root=self.store.project_root)
                summaries.append({**item, "changedPaths": paths[:_PAGE_SIZE],
                    "pathsTruncated": len(paths) > _PAGE_SIZE,
                    "changeSummary": {kind: sum(file.status == kind for file in record.files)
                                      for kind in ("created", "modified", "deleted")},
                    "scopeHints": ["plugin_source" if layer == "plugin_behavior" else layer for layer in layers],
                    **status, "conflicts": status["conflicts"][:_PAGE_SIZE],
                    "conflictCount": len(status["conflicts"]),
                    "conflictsTruncated": len(status["conflicts"]) > _PAGE_SIZE})
            if selected and self.evidence.status == "needs_user_input":
                self.evidence.reason = "recovery_target_not_confirmed"
            return {**result, "transactions": summaries, "offset": offset, "limit": limit,
                    "hasMore": offset + limit < len(records), "total": len(records),
                    "truncated": offset + limit < len(records),
                    "nextOffset": offset + len(selected) if offset + limit < len(records) else None}
        try:
            return self._call("inspect_creator_transactions", {"offset": offset, "limit": limit},
                              execute, "transactions_inspected")
        except CreatorTransactionError as error:
            return {"status": "query_error", "error": error.code}

    def _list(self) -> dict[str, object]:
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
                "transactions": transactions, "truncated": False,
                "association": "unavailable"}

    def inspect(self, run_id: str, *, page: int = 1) -> dict[str, object]:
        return self._call("inspect_creator_transaction", {"run_id": run_id, "page": page},
                          lambda: self._inspect(run_id, page=page), "transaction_details_read")

    def _inspect(self, run_id: str, *, page: int = 1) -> dict[str, object]:
        if page < 1:
            return {"status": "query_error", "error": "INVALID_PAGE"}
        try:
            record = self.store.load(run_id)
            status = self._recovery_status(record)
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
        state = self._inspection(record)
        state.summary_seen = True
        state.scope_complete = complete
        state.conflict_checked = True
        state.selected_paths = tuple(file.path for index, file in enumerate(record.files)
                                     if index // _PAGE_SIZE + 1 in pages)
        if self.evidence.status == "needs_user_input":
            self.evidence.reason = "recovery_target_not_confirmed"
        return {"status": "available", "runId": run_id,
                "transactionId": digest, "scopeComplete": complete,
                "fileCount": total, "observedPages": len(pages),
                "page": page, "pageCount": page_count,
                "files": scope[start:start + _PAGE_SIZE],
                **status,
                **({"recoveryConfirmation": {"required": True,
                     "nextAction": "undo_creator_run",
                     "reason": "acknowledge_already_undone_scope_before_validation"}}
                   if complete and status["alreadyUndone"] and status["beforeStateMatches"] else {}),
                "association": "unavailable"}

    def change(self, run_id: str, path: str) -> dict[str, object]:
        return self._call("inspect_creator_transaction_change", {"run_id": run_id, "path": path},
                          lambda: self._change(run_id, path), "transaction_changes_read")

    def _change(self, run_id: str, path: str) -> dict[str, object]:
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
        listing = self._list()
        if listing["status"] == "query_error":
            return listing
        listing = {**listing, "transactions": listing["transactions"][:100],
                   "truncated": len(listing["transactions"]) > 100}
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
        return self._call("undo_creator_run", {"run_id": run_id, "transaction_id": transaction_id,
                          "requested_paths": sorted(requested_paths)},
                          lambda: self._undo(run_id, transaction_id, requested_paths), "undo_attempts")

    def _undo(self, run_id: str, transaction_id: str,
              requested_paths: list[str]) -> dict[str, object]:
        state = self.evidence.inspected_transactions.get(run_id)
        if state is None or not (state.summary_seen and state.scope_complete and state.conflict_checked):
            return {"status": "observation_required", "error": "RECOVERY_SCOPE_NOT_CONFIRMED",
                    "completion": {"status": "needs_user_input", "reason": "missing_recovery_evidence"}}
        if state.transaction_id != transaction_id:
            return self._conflict("CREATOR_TRANSACTION_CHANGED")
        try:
            record = self.store.load(run_id)
            if _record_digest(record) != transaction_id:
                return self._conflict("CREATOR_TRANSACTION_CHANGED")
            paths = {file.path for file in record.files}
            if set(state.selected_paths) != paths:
                return {"status": "observation_required", "error": "RECOVERY_SCOPE_NOT_CONFIRMED"}
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
            if error.code == "CREATOR_ALREADY_UNDONE":
                # The marker alone is insufficient: later edits must not be
                # described as already recovered.
                if any(read_creator_file_state(self.store.project_root, file.path).hash != file.before.hash
                       for file in record.files):
                    return self._conflict("CREATOR_UNDO_CONFLICT")
                self.evidence.recovered_transactions[run_id] = transaction_id
                self.evidence.status = "already_recovered"
                self.evidence.reason = None
                self.evidence.final_state = "pending_validation"
                self.evidence.recovered_states.update({file.path: file.before.hash for file in record.files})
                return {"ok": True, "status": "already_undone", "runId": run_id,
                        "changedPaths": [], "alreadyUndone": True,
                        "completion": {"status": "already_recovered", "nextAction": "validate_current_revision"}}
            if error.code in {"CREATOR_TRANSACTION_CHANGED", "CREATOR_UNDO_CONFLICT"}:
                return self._conflict(error.code)
            return {"status": "query_error", "error": error.code}
        if self.activity is not None:
            for path in result.changed_paths:
                self.activity.file_observations.observe(path)
                self.activity.touch(path)
        self.evidence.recovered_transactions[run_id] = transaction_id
        self.evidence.status = "recovered"
        self.evidence.reason = None
        self.evidence.final_state = "pending_validation"
        self.evidence.recovery_mutation_count += len(result.changed_paths)
        self.evidence.recovered_states.update({file.path: file.before.hash for file in record.files})
        return {"ok": True, "status": "undone", "runId": run_id,
                "changedPaths": list(result.changed_paths), "alreadyUndone": False,
                "completion": {"status": "recovered", "nextAction": "validate_current_revision"}}

    def is_recovery_only(self) -> bool:
        return self.activity is not None and self.evidence.status != "inactive" and (
            self.activity.revision == self.evidence.recovery_mutation_count
        )

    def current_recovery_matches(self) -> bool:
        try:
            for run_id, transaction_id in self.evidence.recovered_transactions.items():
                record = self.store.load(run_id)
                if _record_digest(record) != transaction_id:
                    return False
            return bool(self.evidence.recovered_transactions) and all(
                read_creator_file_state(self.store.project_root, path).hash == digest
                for path, digest in self.evidence.recovered_states.items()
            )
        except (CreatorTransactionError, OSError, ValueError):
            return False

    def _conflict(self, code: str) -> dict[str, object]:
        self.evidence.status = self.evidence.final_state = "blocked"
        self.evidence.reason = "recovery_conflict"
        if self.run_control is not None:
            self.run_control.block(category="recovery_conflict", code=code, source="undo_creator_run",
                                   message="恢复被阻塞：历史记录或当前文件已发生变化，未覆盖后续修改。")
        return {"status": "conflict", "error": code,
                "completion": {"status": "blocked", "reason": "recovery_conflict"}}


def create_recovery_query_tools(queries: CreatorRecoveryQueries) -> tuple[BaseTool, ...]:
    @tool("inspect_creator_transactions")
    def inspect_creator_transactions(offset: int = 0, limit: int = _PAGE_SIZE) -> str:
        """Page through bounded change summaries, without source. Select using the user's request; recency alone is insufficient. Confirm scope with inspect_creator_transaction before undo."""
        return _result(**queries.list(offset=offset, limit=limit))

    @tool("inspect_creator_transaction")
    def inspect_creator_transaction(run_id: str, page: int = 1) -> str:
        """Confirm transaction scope and conflicts. Inspect all pages before undo; saved diffs are optional. When recoveryConfirmation is required, acknowledge the observed whole scope with undo_creator_run before validation."""
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
        """Undo an explicitly requested whole Creator run after full scope inspection. Supply exactly the paths the user requested to undo; a partial scope is rejected. Already-undone runs are acknowledged without writes after before-state hash checks. On recovery success validate the current revision and finish; do not repeat undo."""
        return _result(**queries.undo(run_id, transaction_id, requested_paths))

    return undo_creator_run
