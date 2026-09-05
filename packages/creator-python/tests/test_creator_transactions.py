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
        lambda value: value["files"][0].update(status="created"),
        lambda value: value["files"][0]["before"].update(exists=False),
    ],
)
def test_transaction_schema_fails_closed(mutate):
    value = valid_record()
    mutate(value)
    with pytest.raises(CreatorTransactionError):
        parse_transaction_record(value)


def test_transaction_schema_constants_match_typescript():
    assert CREATOR_TRANSACTION_SCHEMA_VERSION == 1
    assert CREATOR_MISSING_FILE_HASH == creator_content_hash("<missing>")


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
