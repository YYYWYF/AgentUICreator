import asyncio
import json

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.app_ui_model.mutation_lock import ProjectMutationCoordinator
from agent_ui_creator.domain_tools.recovery_tools import (
    RecoveryEvidence, create_recovery_inspection_tools,
    create_undo_creator_change_tool,
)
from agent_ui_creator.run_control import CreatorRunControlState
from agent_ui_creator.transactions import CreatorTransactionFileInput, CreatorTransactionStore


def _record(tmp_path, run_id, path, before, after):
    target = tmp_path / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(after, encoding="utf-8")
    CreatorTransactionStore(tmp_path).persist_run(
        run_id=run_id, mutation_revision=1, validation_revision=None,
        files=(CreatorTransactionFileInput(path, before, after),),
    )
    return target


def test_inspection_keeps_newer_conflict_visible_and_limits_detail_to_recorded_path(tmp_path):
    old = _record(tmp_path, "older", "plugins/old.ts", "a", "b")
    newer = _record(tmp_path, "newer", "plugins/new.ts", "c", "d")
    newer.write_text("manual edit", encoding="utf-8")
    evidence = RecoveryEvidence()
    inspect = create_recovery_inspection_tools(tmp_path, evidence=evidence)[0]

    listed = json.loads(inspect.invoke({}))
    assert {item["runId"] for item in listed["records"]} == {"older", "newer"}
    assert next(item for item in listed["records"] if item["runId"] == "newer")["undoable"] is False
    assert old.read_text(encoding="utf-8") == "b"
    assert "newer" in evidence.delivered_run_ids
    denied = json.loads(inspect.invoke({"run_id": "newer", "path": "plugins/old.ts"}))
    assert denied["code"] == "FILE_NOT_IN_TRANSACTION"


def test_undo_requires_delivered_exact_run_and_preserves_earlier_change(tmp_path):
    welcome = _record(tmp_path, "welcome", "plugins/welcome.ts", "old", "new")
    panel = _record(tmp_path, "panel", "plugins/panel.ts", "absent", "added")
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("recovery-run")
    evidence = RecoveryEvidence()
    control = CreatorRunControlState()
    undo = create_undo_creator_change_tool(
        tmp_path, activity, ProjectMutationCoordinator(), control, evidence,
    )
    denied = json.loads(asyncio.run(undo.ainvoke({"run_id": "panel"})))
    assert denied["code"] == "CREATOR_TRANSACTION_INSPECTION_REQUIRED"

    inspect = create_recovery_inspection_tools(tmp_path, evidence=evidence)[0]
    inspect.invoke({"run_id": "panel"})
    result = json.loads(asyncio.run(undo.ainvoke({"run_id": "panel"})))
    assert result["ok"] is True
    assert result["result"]["changedPaths"] == ["plugins/panel.ts"]
    assert panel.read_text(encoding="utf-8") == "absent"
    assert welcome.read_text(encoding="utf-8") == "new"
    assert activity.mutation_paths == ("plugins/panel.ts",)


def test_undo_conflict_keeps_current_content_and_blocks_run(tmp_path):
    target = _record(tmp_path, "panel", "plugins/panel.ts", "old", "new")
    target.write_text("manual edit", encoding="utf-8")
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("recovery-run")
    evidence = RecoveryEvidence()
    control = CreatorRunControlState()
    create_recovery_inspection_tools(tmp_path, evidence=evidence)[0].invoke({"run_id": "panel"})
    undo = create_undo_creator_change_tool(
        tmp_path, activity, ProjectMutationCoordinator(), control, evidence,
    )
    result = json.loads(asyncio.run(undo.ainvoke({"run_id": "panel"})))
    assert result["code"] == "CREATOR_UNDO_CONFLICT"
    assert target.read_text(encoding="utf-8") == "manual edit"
    assert control.blocked
    assert activity.mutation_paths == ()
