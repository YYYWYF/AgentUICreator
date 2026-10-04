from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from langchain_core.tools import BaseTool, tool

from ..activity import CreatorActivityRecorder
from ..app_ui_model.mutation_lock import ProjectMutationCoordinator
from ..files import read_creator_file_state
from ..project_paths import agent_ui_source_root
from ..run_control import CreatorRunControlState
from ..transactions import CreatorTransactionError, CreatorTransactionStore


def _json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


@dataclass(slots=True)
class RecoveryEvidence:
    delivered_run_ids: set[str] = field(default_factory=set)


def create_recovery_inspection_tools(
    project_root: str | Path, *, run_control: CreatorRunControlState | None = None,
    evidence: RecoveryEvidence | None = None,
) -> tuple[BaseTool, ...]:
    store = CreatorTransactionStore(project_root)

    @tool("inspect_creator_changes")
    def inspect_creator_changes(
        run_id: str | None = None,
        path: str | None = None,
        offset: int = 0,
        limit: int = 10,
        file_offset: int = 0,
        file_limit: int = 10,
    ) -> str:
        """List actual Creator transaction summaries, or inspect one run and one recorded file. Read only. A recent record is not automatically the user's intended target."""
        if offset < 0 or limit < 1 or limit > 10 or file_offset < 0 or file_limit < 1 or file_limit > 10:
            return _json({
                "ok": False, "code": "INVALID_PAGE",
                "message": "offset and file_offset must be non-negative; limit and file_limit must be 1–10.",
            })
        if path is not None and run_id is None:
            return _json({"ok": False, "code": "RUN_ID_REQUIRED"})
        try:
            records = (
                (store.load(run_id),) if run_id is not None
                else store.list_records()
            )
            page = records[offset:offset + limit]
            summaries = []
            for record in page:
                status = store.status(record.run_id)
                item = {
                    "runId": record.run_id,
                    "createdAt": record.created_at,
                    "mutationRevision": record.mutation_revision,
                    "validationRevision": record.validation_revision,
                    "undoable": status.undoable,
                    "undone": store.was_undone(record.run_id),
                    "conflictCount": len(status.conflicts),
                    "conflictsComplete": len(status.conflicts) <= 10,
                    "conflicts": [conflict.to_dict() for conflict in status.conflicts[:10]],
                    "fileCount": len(record.files),
                    "filesComplete": file_offset + file_limit >= len(record.files),
                    "nextFileOffset": (
                        file_offset + file_limit
                        if file_offset + file_limit < len(record.files) else None
                    ),
                    "files": [
                        {
                            "path": file.path,
                            "status": file.status,
                            "beforeAvailable": not file.before.exists or file.before.content is not None,
                            "afterAvailable": not file.after.exists or file.after.content is not None,
                        }
                        for file in record.files[file_offset:file_offset + file_limit]
                    ],
                }
                if path is not None:
                    file = next((file for file in record.files if file.path == path), None)
                    if file is None:
                        return _json({"ok": False, "code": "FILE_NOT_IN_TRANSACTION"})
                    detail: dict[str, object] = {
                        "path": path,
                        "beforeHash": file.before.hash,
                        "afterHash": file.after.hash,
                        "contentAvailable": not file.after.exists or file.after.content is not None,
                    }
                    if detail["contentAvailable"]:
                        detail["beforeLineCount"] = len((file.before.content or "").splitlines())
                        detail["afterLineCount"] = len((file.after.content or "").splitlines())
                    item["detail"] = detail
                summaries.append(item)
            if evidence is not None:
                evidence.delivered_run_ids.update(item["runId"] for item in summaries)
            end = offset + len(page)
            return _json({
                "ok": True, "records": summaries, "complete": end >= len(records),
                "nextOffset": end if end < len(records) else None,
                "threadAssociation": "unavailable",
            })
        except CreatorTransactionError as error:
            return _json({"ok": False, "code": error.code, "message": str(error)})

    @tool("inspect_agent_ui_baseline")
    def inspect_agent_ui_baseline() -> str:
        """Report whether the project has a trusted original template baseline. The current project or latest registry template is never treated as historical original content."""
        try:
            source_root = agent_ui_source_root(project_root)
        except (OSError, ValueError) as error:
            return _json({"ok": False, "status": "error", "message": str(error)})
        if run_control is not None:
            run_control.block(
                category="recovery_evidence", code="AGENT_UI_BASELINE_MISSING",
                source="inspect_agent_ui_baseline",
                message="当前工程没有可信的原始模板内容，无法据此执行模板恢复。",
                details={"sourceRoot": source_root},
            )
        return _json({"ok": True, "status": "baseline_missing", "sourceRoot": source_root,
                      "templateIdentity": None, "originalContentAvailable": False,
                      "coverage": [], "reason": "No trustworthy original template content is recorded for this project."})

    return (inspect_creator_changes, inspect_agent_ui_baseline)


def create_undo_creator_change_tool(
    project_root: str | Path,
    activity: CreatorActivityRecorder,
    coordinator: ProjectMutationCoordinator,
    run_control: CreatorRunControlState,
    evidence: RecoveryEvidence,
) -> BaseTool:
    store = CreatorTransactionStore(project_root)

    @tool("undo_creator_change")
    async def undo_creator_change(run_id: str) -> str:
        """Undo exactly the specified Creator run if every recorded after-state still matches. Requires the current user's authorization to reverse that run; inspect_creator_changes first. Never choose a global latest run implicitly."""
        if run_id not in evidence.delivered_run_ids:
            return _json({"ok": False, "code": "CREATOR_TRANSACTION_INSPECTION_REQUIRED",
                          "message": "Inspect the target Creator record in this run before undo."})
        try:
            async with coordinator.transaction(project_root):
                record = store.load(run_id)
                before = {}
                for file in record.files:
                    before[file.path] = read_creator_file_state(project_root, file.path)
                    activity.capture_before(file.path)
                result = store.undo(run_id)
                changed_paths = []
                for path in result.changed_paths:
                    current = read_creator_file_state(project_root, path)
                    if current.exists != before[path].exists or current.hash != before[path].hash:
                        activity.touch(path)
                        changed_paths.append(path)
                if not changed_paths:
                    activity.record_semantic_noop(
                        source="undo_creator_change", reason="already-undone",
                    )
                return _json({"ok": True, "result": {"runId": result.run_id,
                    "changedPaths": changed_paths, "alreadyUndone": not changed_paths,
                    "reapplyable": result.record.reapplyable}})
        except CreatorTransactionError as error:
            if error.code in {"CREATOR_UNDO_CONFLICT", "CREATOR_TRANSACTION_NOT_FOUND"}:
                run_control.block(
                    category="recovery_conflict", code=error.code,
                    source="undo_creator_change", message=str(error),
                    details=error.details if isinstance(error.details, dict) else {},
                )
            return _json({"ok": False, "code": error.code, "message": str(error),
                          "details": error.details})

    return undo_creator_change
