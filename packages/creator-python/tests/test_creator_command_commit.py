import json
from pathlib import Path
from fastapi.testclient import TestClient
from agent_ui_creator.config import CreatorServerSettings
from agent_ui_creator.server import create_app
from agent_ui_creator.transactions import CreatorTransactionStore
import pytest

@pytest.fixture(autouse=True)
def verifier(monkeypatch):
    async def verify(root, _runtime):
        config = json.loads((root / ".agent-ui/project.json").read_text())
        source = (root / config["sourceRoot"] / "agent-ui/theme/theme-config.ts").read_text()
        assert source, "Verifier reads the published file"
        return {"status": "passed", "errors": [], "warnings": []}
    monkeypatch.setattr("agent_ui_creator.theme_command_transaction.verify_published_theme", verify)



def setup(tmp_path: Path):
    (tmp_path / ".agent-ui").mkdir()
    (tmp_path / ".agent-ui/project.json").write_text(json.dumps({"mode": "platform", "sourceRoot": "src"}))
    relative = "src/agent-ui/theme/theme-config.ts"
    file = tmp_path / relative
    file.parent.mkdir(parents=True)
    before = 'export const agentUIThemeConfig = { theme: "light" };\n'
    after = before.replace('"light"', '"violet"')
    file.write_text(before)
    settings = CreatorServerSettings(project_root=tmp_path, skills_root=tmp_path, auth_token="x" * 32)
    app = create_app(settings)
    client = TestClient(app, headers={"Authorization": f"Bearer {settings.auth_token}"})
    return app, client, file, {"path": relative, "before": before, "after": after, "verificationRuntime": "file:///test/project-control-runtime.mjs"}


def test_command_uses_existing_undo_reapply_store(tmp_path):
    _, client, file, change = setup(tmp_path)
    response = client.post("/creator-command-commit", json=change)
    assert response.status_code == 200, response.text
    run_id = response.json()["runId"]
    store = CreatorTransactionStore(tmp_path)
    assert store.status(run_id).undoable
    assert file.read_text() == change["after"]
    store.undo(run_id)
    assert file.read_text() == change["before"]
    store.reapply(run_id)
    assert file.read_text() == change["after"]


def test_noop_and_conflicts_leave_files_unchanged(tmp_path):
    _, client, file, change = setup(tmp_path)
    assert client.post("/creator-command-commit", json={**change, "after": change["before"]}).json()["verification"]["status"] == "passed"
    assert not (tmp_path / ".agentuicreator/transactions").exists()
    assert client.post("/creator-command-commit", json={**change, "before": "stale"}).status_code == 409
    assert client.post("/creator-command-commit", json={**change, "path": "../outside.ts"}).status_code == 409
    assert file.read_text() == change["before"]


def test_pending_question_blocks_command_storage(tmp_path):
    app, client, file, change = setup(tmp_path)
    app.state.pending_creator_questions["thread"] = object()
    response = client.post("/creator-command-commit", json=change)
    assert response.status_code == 409
    assert response.json()["code"] == "CREATOR_COMMAND_BUSY"
    assert file.read_text() == change["before"]


def test_failed_transaction_persistence_never_publishes(tmp_path, monkeypatch):
    _, client, file, change = setup(tmp_path)
    def fail(*_args, **_kwargs):
        raise OSError("storage unavailable")
    monkeypatch.setattr(CreatorTransactionStore, "persist_run", fail)
    assert client.post("/creator-command-commit", json=change).status_code == 409
    assert file.read_text() == change["before"]


def test_verifier_reads_violet_and_failure_restores_original_bytes(tmp_path, monkeypatch):
    _, client, file, change = setup(tmp_path)
    async def fail_after_publication(root, _runtime):
        assert file.read_text() == change["after"]
        store = CreatorTransactionStore(root)
        records = list((root / ".agentuicreator/transactions").glob("*.json"))
        assert any(json.loads(record.read_text()).get("validationRevision") is None for record in records)
        return {"status": "failed", "errors": [{"code": "test", "message": "violet rejected"}], "warnings": []}
    monkeypatch.setattr("agent_ui_creator.theme_command_transaction.verify_published_theme", fail_after_publication)
    response = client.post("/creator-command-commit", json=change)
    assert response.status_code == 409, response.text
    assert "THEME_STATIC_VALIDATION_FAILED" in response.json()["error"]
    assert file.read_text() == change["before"]
    assert not (tmp_path / ".agentuicreator/control/pending-theme-command.json").exists()


def test_verifier_exception_also_rolls_back(tmp_path, monkeypatch):
    _, client, file, change = setup(tmp_path)
    async def crash(root, _runtime):
        assert file.read_text() == change["after"]
        raise ValueError("verifier unavailable")
    monkeypatch.setattr("agent_ui_creator.theme_command_transaction.verify_published_theme", crash)
    assert client.post("/creator-command-commit", json=change).status_code == 409
    assert file.read_text() == change["before"]


def test_restart_recovers_unverified_published_transaction(tmp_path):
    from agent_ui_creator.transactions import CreatorTransactionFileInput
    from agent_ui_creator.theme_command_transaction import JOURNAL
    _, _, file, change = setup(tmp_path)
    store = CreatorTransactionStore(tmp_path)
    store.persist_run(run_id="interrupted-theme", mutation_revision=1, validation_revision=None,
        files=[CreatorTransactionFileInput(change["path"], change["before"], change["after"])])
    file.write_text(change["after"])
    journal = tmp_path / JOURNAL
    journal.parent.mkdir(parents=True, exist_ok=True)
    journal.write_text(json.dumps({"runId": "interrupted-theme", "ownerPid": 2147483647}))
    create_app(CreatorServerSettings(project_root=tmp_path, skills_root=tmp_path, auth_token="x" * 32))
    assert file.read_text() == change["before"]
    assert not journal.exists()


def test_success_is_verified_only_after_violet_is_on_disk(tmp_path, monkeypatch):
    _, client, file, change = setup(tmp_path)
    calls = []
    async def verify_violet(root, _runtime):
        calls.append(file.read_text())
        assert calls[-1] == change["after"]
        return {"status": "passed", "errors": [], "warnings": []}
    monkeypatch.setattr("agent_ui_creator.theme_command_transaction.verify_published_theme", verify_violet)
    response = client.post("/creator-command-commit", json=change)
    assert response.status_code == 200
    assert calls == [change["after"]]
    assert CreatorTransactionStore(tmp_path).load(response.json()["runId"]).validation_revision == 1


def test_host_mutation_guard_preserves_writing_lock_and_pending_question_admission(tmp_path):
    app, client, _, change = setup(tmp_path)
    with client:
        app.state.pending_creator_questions["thread"] = object()
        assert client.post("/creator-command-mutation", json={"action": "acquire"}).json()["code"] == "CREATOR_COMMAND_BUSY"
        app.state.pending_creator_questions.clear()
        token = client.post("/creator-command-mutation", json={"action": "acquire"}).json()["token"]
        assert client.post("/creator-command-mutation", json={"action": "acquire"}).status_code == 409
        assert client.post("/creator-command-commit", json=change).json()["code"] == "CREATOR_COMMAND_BUSY"
        assert client.post("/creator", json={"threadId": "new-thread", "runId": "new-run", "messages": [], "tools": [], "context": [], "state": {}, "forwardedProps": {}}).json()["code"] == "CREATOR_COMMAND_BUSY"
        assert client.post("/creator-command-mutation", json={"action": "release", "token": "wrong"}).status_code == 409
        assert client.post("/creator-command-mutation", json={"action": "release", "token": token}).status_code == 200
        assert client.post("/creator-command-commit", json=change).status_code == 200
