import json
from pathlib import Path
from fastapi.testclient import TestClient
from agent_ui_creator.config import CreatorServerSettings
from agent_ui_creator.server import create_app
from agent_ui_creator.transactions import CreatorTransactionStore


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
    return app, client, file, {"path": relative, "before": before, "after": after}


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
    assert client.post("/creator-command-commit", json={**change, "after": change["before"]}).json() == {}
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
