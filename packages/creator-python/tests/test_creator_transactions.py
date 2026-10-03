import json

import pytest

from agent_ui_creator.files import CREATOR_MISSING_FILE_HASH, creator_content_hash
from agent_ui_creator.transactions import (
    CREATOR_TRANSACTION_SCHEMA_VERSION,
    MAX_CREATOR_TRANSACTION_BYTES,
    MAX_CREATOR_TRANSACTION_FILES,
    CreatorTransactionError,
    CreatorTransactionFileInput,
    CreatorTransactionStore,
    parse_transaction_record,
)


def valid_record():
    return {
        "schemaVersion": 1,
        "runId": "run-1",
        "createdAt": "2026-09-05T00:00:00.000Z",
        "mutationRevision": 1,
        "validationRevision": None,
        "files": [
            {
                "path": "plugins/foo.ts",
                "status": "modified",
                "before": {
                    "exists": True,
                    "hash": creator_content_hash("old"),
                    "content": "old",
                },
                "after": {"exists": True, "hash": creator_content_hash("new")},
            }
        ],
    }


@pytest.mark.parametrize(
    "mutate",
    [
        lambda value: value.update(schemaVersion=2),
        lambda value: value["files"].append(value["files"][0].copy()),
        lambda value: value["files"][0]["before"].update(hash="bad"),
        lambda value: value["files"][0]["after"].update(content="wrong"),
        lambda value: value["files"][0].update(status="created"),
        lambda value: value["files"][0]["before"].update(exists=False),
    ],
)
def test_transaction_schema_fails_closed(mutate):
    value = valid_record()
    mutate(value)
    with pytest.raises(CreatorTransactionError):
        parse_transaction_record(value)


def test_transaction_schema_constants_remain_stable():
    assert CREATOR_TRANSACTION_SCHEMA_VERSION == 1
    assert CREATOR_MISSING_FILE_HASH == creator_content_hash("<missing>")


def test_transaction_schema_accepts_legacy_record_without_created_directories():
    record = parse_transaction_record(valid_record())

    assert record.created_directories == ()


@pytest.mark.parametrize(
    "created_directories",
    [
        [""],
        ["."],
        ["/plugins/task-status"],
        ["C:/plugins/task-status"],
        ["plugins/../outside"],
        ["plugins/task-status", "plugins/task-status"],
    ],
)
def test_transaction_schema_rejects_invalid_created_directories(created_directories):
    value = valid_record()
    value["createdDirectories"] = created_directories

    with pytest.raises(CreatorTransactionError):
        parse_transaction_record(value)


def test_transaction_schema_rejects_file_count_and_json_byte_overflow(tmp_path):
    value = valid_record()
    value["files"] = [
        {**value["files"][0], "path": f"plugins/{index}.ts"}
        for index in range(MAX_CREATOR_TRANSACTION_FILES + 1)
    ]
    with pytest.raises(CreatorTransactionError) as file_error:
        parse_transaction_record(value)
    assert file_error.value.code == "CREATOR_TRANSACTION_TOO_LARGE"

    store = CreatorTransactionStore(tmp_path)
    directory = tmp_path / ".agentuicreator" / "transactions"
    directory.mkdir(parents=True)
    transaction_path = directory / store._file_name("oversized")
    transaction_path.write_bytes(b" " * (MAX_CREATOR_TRANSACTION_BYTES + 1))
    with pytest.raises(CreatorTransactionError) as byte_error:
        store.load("oversized")
    assert byte_error.value.code == "CREATOR_TRANSACTION_TOO_LARGE"


def test_deleted_file_transaction_restores_content(tmp_path):
    target = tmp_path / "plugins" / "deleted.ts"
    target.parent.mkdir()
    target.write_text("before\n", encoding="utf-8")
    store = CreatorTransactionStore(tmp_path)
    target.unlink()
    store.persist_run(
        run_id="delete-run",
        mutation_revision=1,
        validation_revision=None,
        files=(CreatorTransactionFileInput("plugins/deleted.ts", "before\n", None),),
    )

    assert store.status("delete-run").undoable is True
    store.undo("delete-run")
    assert target.read_text(encoding="utf-8") == "before\n"


def test_reapply_round_trip_for_created_modified_and_deleted_files(tmp_path):
    plugins = tmp_path / "plugins"
    plugins.mkdir()
    modified = plugins / "modified.ts"
    modified.write_text("after modified", encoding="utf-8")
    deleted = plugins / "deleted.ts"
    created = plugins / "created.ts"
    created.write_text("created", encoding="utf-8")
    store = CreatorTransactionStore(tmp_path)
    record = store.persist_run(
        run_id="round-trip",
        mutation_revision=3,
        validation_revision=None,
        files=(
            CreatorTransactionFileInput("plugins/modified.ts", "before modified", "after modified"),
            CreatorTransactionFileInput("plugins/deleted.ts", "before deleted", None),
            CreatorTransactionFileInput("plugins/created.ts", None, "created"),
        ),
    )
    assert record is not None and record.reapplyable
    assert store.load("round-trip").reapplyable

    store.undo("round-trip")
    assert modified.read_text(encoding="utf-8") == "before modified"
    assert deleted.read_text(encoding="utf-8") == "before deleted"
    assert not created.exists()

    store.reapply("round-trip")
    store.reapply("round-trip")
    assert modified.read_text(encoding="utf-8") == "after modified"
    assert not deleted.exists()
    assert created.read_text(encoding="utf-8") == "created"
    assert store.status("round-trip").undoable
    store.undo("round-trip")
    assert not created.exists()


def test_reapply_conflict_performs_zero_writes(tmp_path):
    plugins = tmp_path / "plugins"
    plugins.mkdir()
    foo = plugins / "foo.ts"
    bar = plugins / "bar.ts"
    foo.write_text("new foo", encoding="utf-8")
    bar.write_text("new bar", encoding="utf-8")
    store = CreatorTransactionStore(tmp_path)
    store.persist_run(
        run_id="reapply-conflict", mutation_revision=2, validation_revision=None,
        files=(
            CreatorTransactionFileInput("plugins/foo.ts", "old foo", "new foo"),
            CreatorTransactionFileInput("plugins/bar.ts", "old bar", "new bar"),
        ),
    )
    store.undo("reapply-conflict")
    bar.write_text("manual edit", encoding="utf-8")
    with pytest.raises(CreatorTransactionError) as captured:
        store.reapply("reapply-conflict")
    assert captured.value.code == "CREATOR_REAPPLY_CONFLICT"
    assert [item["path"] for item in captured.value.details["conflicts"]] == ["plugins/bar.ts"]
    assert foo.read_text(encoding="utf-8") == "old foo"
    assert bar.read_text(encoding="utf-8") == "manual edit"


def test_reapply_write_failure_restores_all_files(tmp_path):
    plugins = tmp_path / "plugins"
    plugins.mkdir()
    foo = plugins / "foo.ts"
    bar = plugins / "bar.ts"
    foo.write_text("new foo", encoding="utf-8")
    bar.write_text("new bar", encoding="utf-8")
    store = CreatorTransactionStore(tmp_path)
    store.persist_run(
        run_id="reapply-failure", mutation_revision=2, validation_revision=None,
        files=(
            CreatorTransactionFileInput("plugins/foo.ts", "old foo", "new foo"),
            CreatorTransactionFileInput("plugins/bar.ts", "old bar", "new bar"),
        ),
    )
    store.undo("reapply-failure")
    with pytest.raises(RuntimeError, match="Simulated Creator reapply failure"):
        store.reapply("reapply-failure", simulate_failure_after_write=1)
    assert foo.read_text(encoding="utf-8") == "old foo"
    assert bar.read_text(encoding="utf-8") == "old bar"
    store.reapply("reapply-failure")
    assert foo.read_text(encoding="utf-8") == "new foo"


def test_reapply_marker_failure_restores_files(tmp_path, monkeypatch):
    import agent_ui_creator.transactions.store as store_module

    target = tmp_path / "plugins" / "foo.ts"
    target.parent.mkdir()
    target.write_text("after", encoding="utf-8")
    store = CreatorTransactionStore(tmp_path)
    store.persist_run(
        run_id="marker-failure", mutation_revision=1, validation_revision=None,
        files=(CreatorTransactionFileInput("plugins/foo.ts", "before", "after"),),
    )
    store.undo("marker-failure")
    original_remove = store_module.remove_creator_file

    def fail_marker_removal(project_root, file_path, expected=None):
        if file_path.endswith(".undone"):
            raise OSError("marker removal failed")
        return original_remove(project_root, file_path, expected)

    monkeypatch.setattr(store_module, "remove_creator_file", fail_marker_removal)
    with pytest.raises(OSError, match="marker removal failed"):
        store.reapply("marker-failure")
    assert target.read_text(encoding="utf-8") == "before"
    assert (tmp_path / store._undo_marker_path("marker-failure")).exists()


def test_legacy_transaction_can_undo_but_cannot_reapply(tmp_path):
    plugins = tmp_path / "plugins"
    plugins.mkdir()
    target = plugins / "foo.ts"
    target.write_text("new", encoding="utf-8")
    store = CreatorTransactionStore(tmp_path)
    record_path = tmp_path / ".agentuicreator" / "transactions" / store._file_name("run-1")
    record_path.parent.mkdir(parents=True)
    record_path.write_text(json.dumps(valid_record()), encoding="utf-8")
    assert not store.load("run-1").reapplyable
    store.undo("run-1")
    assert target.read_text(encoding="utf-8") == "old"
    with pytest.raises(CreatorTransactionError) as captured:
        store.reapply("run-1")
    assert captured.value.code == "CREATOR_REAPPLY_UNAVAILABLE"


def test_large_after_content_preserves_undo_without_reapply(tmp_path):
    plugins = tmp_path / "plugins"
    plugins.mkdir()
    target = plugins / "large.ts"
    before = "a" * 3_000_000
    after = "b" * 3_000_000
    target.write_text(after, encoding="utf-8")
    store = CreatorTransactionStore(tmp_path)
    record = store.persist_run(
        run_id="large-run", mutation_revision=1, validation_revision=None,
        files=(CreatorTransactionFileInput("plugins/large.ts", before, after),),
    )
    assert record is not None and not record.reapplyable
    store.undo("large-run")
    assert target.read_text(encoding="utf-8") == before


def test_undo_conflict_performs_zero_writes(tmp_path):
    plugins = tmp_path / "plugins"
    plugins.mkdir()
    foo = plugins / "foo.ts"
    bar = plugins / "bar.ts"
    foo.write_text("new foo", encoding="utf-8")
    bar.write_text("new bar", encoding="utf-8")
    store = CreatorTransactionStore(tmp_path)
    store.persist_run(
        run_id="run-1",
        mutation_revision=2,
        validation_revision=None,
        files=(
            CreatorTransactionFileInput("plugins/foo.ts", "old foo", "new foo"),
            CreatorTransactionFileInput("plugins/bar.ts", "old bar", "new bar"),
        ),
    )
    bar.write_text("external", encoding="utf-8")

    with pytest.raises(CreatorTransactionError) as captured:
        store.undo("run-1")
    assert captured.value.code == "CREATOR_UNDO_CONFLICT"
    assert foo.read_text(encoding="utf-8") == "new foo"
    assert bar.read_text(encoding="utf-8") == "external"


def test_undo_failure_rolls_back_applied_files(tmp_path):
    plugins = tmp_path / "plugins"
    plugins.mkdir()
    foo = plugins / "foo.ts"
    bar = plugins / "bar.ts"
    foo.write_text("new foo", encoding="utf-8")
    bar.write_text("new bar", encoding="utf-8")
    store = CreatorTransactionStore(tmp_path)
    store.persist_run(
        run_id="run-1",
        mutation_revision=2,
        validation_revision=None,
        files=(
            CreatorTransactionFileInput("plugins/foo.ts", "old foo", "new foo"),
            CreatorTransactionFileInput("plugins/bar.ts", "old bar", "new bar"),
        ),
    )

    with pytest.raises(RuntimeError, match="Simulated"):
        store.undo("run-1", simulate_failure_after_write=1)
    assert foo.read_text(encoding="utf-8") == "new foo"
    assert bar.read_text(encoding="utf-8") == "new bar"


def test_undo_rollback_failure_has_both_causes(tmp_path, monkeypatch):
    import agent_ui_creator.transactions.store as store_module

    target = tmp_path / "plugins" / "foo.ts"
    target.parent.mkdir()
    target.write_text("new", encoding="utf-8")
    store = CreatorTransactionStore(tmp_path)
    store.persist_run(
        run_id="run-1",
        mutation_revision=1,
        validation_revision=None,
        files=(CreatorTransactionFileInput("plugins/foo.ts", "old", "new"),),
    )
    original_replace = store_module.replace_creator_file_atomically
    calls = 0

    def fail_rollback(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("rollback failed")
        return original_replace(*args, **kwargs)

    monkeypatch.setattr(store_module, "replace_creator_file_atomically", fail_rollback)
    with pytest.raises(CreatorTransactionError) as captured:
        store.undo("run-1", simulate_failure_after_write=1)

    assert captured.value.code == "CREATOR_UNDO_ROLLBACK_FAILED"
    assert "Simulated Creator undo failure" in captured.value.details["cause"]
    assert "rollback failed" in captured.value.details["rollbackCause"]


def test_load_rejects_noncanonical_transaction_path(tmp_path):
    store = CreatorTransactionStore(tmp_path)
    transaction_directory = tmp_path / ".agentuicreator" / "transactions"
    transaction_directory.mkdir(parents=True)
    value = valid_record()
    value["files"][0]["path"] = "../outside.ts"
    path = transaction_directory / (store._file_name("run-1"))
    path.write_text(json.dumps(value), encoding="utf-8")

    with pytest.raises(CreatorTransactionError):
        store.load("run-1")
