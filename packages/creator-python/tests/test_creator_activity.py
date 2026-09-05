from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.minimal_agent.path_policy import (
    MinimalAgentPathPolicy,
    PolicyFilesystemBackend,
)
from agent_ui_creator.transactions import (
    MAX_CREATOR_TRANSACTION_BYTES,
    TRANSACTION_CONTENT_RESERVE_BYTES,
)


def backend_for(tmp_path, run_id="run-1"):
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin(run_id)
    return activity, PolicyFilesystemBackend(
        tmp_path, MinimalAgentPathPolicy.development(), activity=activity
    )


def test_single_edit_finish_is_idempotent_and_undo_restores_file(tmp_path):
    target = tmp_path / "plugins" / "foo.ts"
    target.parent.mkdir()
    target.write_text("old\n", encoding="utf-8")
    activity, backend = backend_for(tmp_path)

    assert backend.read("/plugins/foo.ts").error is None
    assert backend.edit("/plugins/foo.ts", "old", "new").error is None
    receipt = activity.finish()

    assert activity.revision == 1
    assert receipt["files"][0]["path"] == "plugins/foo.ts"
    assert receipt["files"][0]["status"] == "modified"
    assert receipt["validations"] == []
    assert receipt["verification"] == {
        "status": "not-run",
        "projectRevision": 1,
        "auditAttempts": 0,
        "checks": [],
    }
    assert receipt["transaction"] == {"runId": "run-1", "undoable": True}
    assert activity.finish() == receipt

    activity.transactions.undo("run-1")
    assert target.read_text(encoding="utf-8") == "old\n"


def test_multiple_edits_capture_only_first_before_state(tmp_path):
    target = tmp_path / "plugins" / "foo.ts"
    target.parent.mkdir()
    target.write_text("old\n", encoding="utf-8")
    activity, backend = backend_for(tmp_path)

    backend.read("/plugins/foo.ts")
    backend.edit("/plugins/foo.ts", "old", "middle")
    backend.edit("/plugins/foo.ts", "middle", "new")
    receipt = activity.finish()
    transaction = activity.transactions.load("run-1")

    assert activity.revision == 2
    assert transaction.files[0].before.content == "old\n"
    assert "-old" in receipt["files"][0]["diff"]
    assert "+new" in receipt["files"][0]["diff"]


def test_multi_file_transaction_undo_is_atomic(tmp_path):
    plugins = tmp_path / "plugins"
    plugins.mkdir()
    (plugins / "foo.ts").write_text("old foo\n", encoding="utf-8")
    (plugins / "bar.ts").write_text("old bar\n", encoding="utf-8")
    activity, backend = backend_for(tmp_path)

    for name in ("foo", "bar"):
        backend.read(f"/plugins/{name}.ts")
        backend.edit(f"/plugins/{name}.ts", "old", "new")
    receipt = activity.finish()

    assert activity.revision == 2
    assert [file["path"] for file in receipt["files"]] == [
        "plugins/bar.ts",
        "plugins/foo.ts",
    ]
    activity.transactions.undo("run-1")
    assert (plugins / "foo.ts").read_text(encoding="utf-8") == "old foo\n"
    assert (plugins / "bar.ts").read_text(encoding="utf-8") == "old bar\n"


def test_created_file_and_empty_run_semantics(tmp_path):
    (tmp_path / "plugins").mkdir()
    activity, backend = backend_for(tmp_path)

    assert backend.write("/plugins/created.ts", "created\n").error is None
    receipt = activity.finish()
    assert receipt["files"][0]["status"] == "created"
    activity.transactions.undo("run-1")
    assert not (tmp_path / "plugins" / "created.ts").exists()

    activity.begin("empty")
    assert "transaction" not in activity.finish()


def test_noop_write_and_failed_edit_do_not_touch_or_create_transaction(tmp_path):
    target = tmp_path / "plugins" / "foo.ts"
    target.parent.mkdir()
    target.write_text("same\n", encoding="utf-8")
    activity, backend = backend_for(tmp_path)
    backend.read("/plugins/foo.ts")

    assert backend.write("/plugins/foo.ts", "same\n").error is None
    assert backend.edit("/plugins/foo.ts", "missing", "new").error is not None
    receipt = activity.finish()

    assert activity.revision == 0
    assert receipt["files"] == []
    assert "transaction" not in receipt


def test_capture_budget_failure_happens_before_write(tmp_path):
    target = tmp_path / "plugins" / "large.ts"
    target.parent.mkdir()
    original = "x" * (MAX_CREATOR_TRANSACTION_BYTES - TRANSACTION_CONTENT_RESERVE_BYTES)
    target.write_text(original, encoding="utf-8")
    activity, backend = backend_for(tmp_path)
    backend.read("/plugins/large.ts")

    result = backend.edit("/plugins/large.ts", "x", "y")

    assert "CREATOR_TRANSACTION_TOO_LARGE" in result.error
    assert activity.revision == 0
    assert target.read_text(encoding="utf-8") == original


def test_begin_resets_revision_capture_and_completed_receipt(tmp_path):
    target = tmp_path / "plugins" / "foo.ts"
    target.parent.mkdir()
    target.write_text("old", encoding="utf-8")
    activity, backend = backend_for(tmp_path, "first")
    backend.read("/plugins/foo.ts")
    backend.edit("/plugins/foo.ts", "old", "new")
    assert activity.finish()["transaction"]["runId"] == "first"

    activity.begin("second")

    assert activity.revision == 0
    assert activity.run_id == "second"
    assert activity.finish()["files"] == []
