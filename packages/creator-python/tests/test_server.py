from fastapi.testclient import TestClient

from agent_ui_creator.config import CreatorServerSettings
from agent_ui_creator.server import create_app


def test_health_and_ag_ui_echo(tmp_path):
    settings = CreatorServerSettings(
        project_root=tmp_path,
        skills_root=tmp_path,
        auth_token="x" * 32,
    )
    client = TestClient(
        create_app(settings), headers={"Authorization": f"Bearer {settings.auth_token}"}
    )

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["protocolVersion"] == "1"

    response = client.post(
        "/creator",
        json={
            "threadId": "thread-1",
            "runId": "run-1",
            "messages": [{"id": "user-1", "role": "user", "content": "echo"}],
            "tools": [],
            "context": [],
            "state": {},
        },
    )
    assert response.status_code == 200
    assert '"type":"RUN_STARTED"' in response.text
    assert '"delta":"echo"' in response.text
    assert '"type":"RUN_FINISHED"' in response.text


def test_runtime_diagnostics_are_authenticated_and_accepted(tmp_path):
    settings = CreatorServerSettings(
        project_root=tmp_path,
        skills_root=tmp_path,
        auth_token="x" * 32,
    )
    app = create_app(settings)
    unauthenticated = TestClient(app).get("/health")
    assert unauthenticated.status_code == 401

    client = TestClient(
        app, headers={"Authorization": f"Bearer {settings.auth_token}"}
    )
    accepted = client.post(
        "/runtime-diagnostics",
        json={
            "threadId": "thread-1",
            "composition": {
                "schemaVersion": 1,
                "appUIModelHash": "a" * 64,
                "observedAt": "2026-09-04T00:00:00.000Z",
                "instances": [],
            },
        },
    )
    assert accepted.status_code == 202
    assert accepted.json() == {"accepted": True}
