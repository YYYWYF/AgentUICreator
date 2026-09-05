from fastapi.testclient import TestClient
from types import SimpleNamespace

from agent_ui_creator.config import CreatorServerSettings
from agent_ui_creator.model_protocol import ToolProtocolMetrics
from agent_ui_creator.model_protocol.errors import ModelToolProtocolError
from agent_ui_creator.app_ui_model import AppUIModelMutationMetrics
from agent_ui_creator.domain_state import DomainObservationMetrics
from agent_ui_creator.server import create_app


def test_health_and_ag_ui_echo(tmp_path, monkeypatch):
    monkeypatch.setenv("CREATOR_PYTHON_AGENT_MODE", "echo")
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
    assert health.json()["runtime"] == "python"
    assert health.json()["agentMode"] == "echo"

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


def test_default_model_configuration_failure_is_explicit(tmp_path, monkeypatch):
    for name in (
        "CREATOR_PYTHON_AGENT_MODE",
        "CREATOR_MODEL_BASE_URL",
        "MODEL_BASE_URL",
        "CREATOR_MODEL_API_KEY",
        "MODEL_API_KEY",
        "OPENAI_API_KEY",
    ):
        monkeypatch.delenv(name, raising=False)
    settings = CreatorServerSettings(
        project_root=tmp_path,
        skills_root=tmp_path,
        auth_token="x" * 32,
    )
    client = TestClient(
        create_app(settings),
        headers={"Authorization": f"Bearer {settings.auth_token}"},
    )

    response = client.post(
        "/creator",
        json={
            "threadId": "thread-1",
            "runId": "run-1",
            "messages": [{"role": "user", "content": "edit"}],
        },
    )

    assert '"type":"RUN_ERROR"' in response.text
    assert '"code":"MODEL_CONFIGURATION_ERROR"' in response.text
    assert '"type":"RUN_FINISHED"' not in response.text


def test_minimal_mode_streams_tool_activity_and_protocol_metrics(tmp_path, monkeypatch):
    monkeypatch.setenv("CREATOR_PYTHON_AGENT_MODE", "minimal")
    settings = CreatorServerSettings(
        project_root=tmp_path,
        skills_root=tmp_path,
        auth_token="x" * 32,
    )
    metrics = ToolProtocolMetrics(modelCalls=2, toolCalls=1, validToolCalls=1)

    async def fake_result(_settings, _prompt, _activity):
        return SimpleNamespace(
            text="Updated and verified.",
            metrics=metrics,
            activities=(
                SimpleNamespace(
                    callId="call-1",
                    name="read_file",
                    arguments={"file_path": "/plugins/a.ts"},
                    status="success",
                    result="1: old",
                ),
            ),
        )

    monkeypatch.setattr("agent_ui_creator.server._minimal_agent_result", fake_result)
    client = TestClient(
        create_app(settings), headers={"Authorization": f"Bearer {settings.auth_token}"}
    )
    response = client.post(
        "/creator",
        json={
            "threadId": "thread-1",
            "runId": "run-1",
            "messages": [{"role": "user", "content": "edit"}],
        },
    )

    assert '"type":"TOOL_CALL_START"' in response.text
    assert '"toolCallName":"read_file"' in response.text
    assert '"delta":"Updated and verified."' in response.text
    assert '"phase":"minimal-agent"' in response.text
    assert '"validToolCalls":1' in response.text
    assert '"receipt":{"files":[],"validations":[]' in response.text
    assert '"status":"not-run"' in response.text


def test_minimal_mode_propagates_protocol_failure_as_run_error(tmp_path, monkeypatch):
    monkeypatch.setenv("CREATOR_PYTHON_AGENT_MODE", "minimal")
    settings = CreatorServerSettings(
        project_root=tmp_path,
        skills_root=tmp_path,
        auth_token="x" * 32,
    )

    async def fail(_settings, _prompt, _activity):
        raise ModelToolProtocolError("malformed twice")

    monkeypatch.setattr("agent_ui_creator.server._minimal_agent_result", fail)
    client = TestClient(
        create_app(settings), headers={"Authorization": f"Bearer {settings.auth_token}"}
    )
    response = client.post(
        "/creator",
        json={
            "threadId": "thread-1",
            "runId": "run-1",
            "messages": [{"role": "user", "content": "edit"}],
        },
    )

    assert '"type":"RUN_ERROR"' in response.text
    assert '"code":"MODEL_TOOL_PROTOCOL_ERROR"' in response.text
    assert '"receipt":{"files":[],"validations":[]' in response.text
    assert '"type":"RUN_FINISHED"' not in response.text


def test_domain_read_mode_streams_project_control_metrics(tmp_path, monkeypatch):
    monkeypatch.setenv("CREATOR_PYTHON_AGENT_MODE", "domain-read")
    settings = CreatorServerSettings(
        project_root=tmp_path,
        skills_root=tmp_path,
        auth_token="x" * 32,
    )
    metrics = ToolProtocolMetrics(modelCalls=2, toolCalls=1, validToolCalls=1)

    async def fake_result(_settings, _prompt, _activity):
        return SimpleNamespace(
            text="Inspected.",
            metrics=metrics,
            project_control=SimpleNamespace(
                to_dict=lambda: {
                    "requests": 1,
                    "byOperation": {"inspect_ui_project": 1},
                    "failures": 0,
                    "durationMs": 12,
                }
            ),
            repeated_project_control_reads=0,
            domain_observations=DomainObservationMetrics(updates=1),
            activities=(),
        )

    monkeypatch.setattr(
        "agent_ui_creator.server._domain_read_agent_result", fake_result
    )
    client = TestClient(
        create_app(settings), headers={"Authorization": f"Bearer {settings.auth_token}"}
    )
    response = client.post(
        "/creator",
        json={
            "threadId": "thread-1",
            "runId": "run-1",
            "messages": [{"role": "user", "content": "inspect"}],
        },
    )

    assert '"phase":"domain-read-agent"' in response.text
    assert '"inspect_ui_project":1' in response.text
    assert '"repeatedProjectControlReads":0' in response.text


def test_default_mode_runs_domain_write_with_runtime_identity(tmp_path, monkeypatch):
    monkeypatch.delenv("CREATOR_PYTHON_AGENT_MODE", raising=False)
    settings = CreatorServerSettings(
        project_root=tmp_path,
        skills_root=tmp_path,
        auth_token="x" * 32,
    )
    metrics = ToolProtocolMetrics(modelCalls=3, toolCalls=2, validToolCalls=2)

    async def fake_result(_settings, _prompt, _activity, _coordinator):
        return SimpleNamespace(
            text="Static composition committed.",
            metrics=metrics,
            project_control=SimpleNamespace(
                to_dict=lambda: {
                    "requests": 2,
                    "byOperation": {
                        "inspect_app_ui_model": 1,
                        "mutate_app_ui_model": 1,
                    },
                    "failures": 0,
                    "durationMs": 12,
                }
            ),
            repeated_project_control_reads=0,
            domain_observations=DomainObservationMetrics(
                updates=2, hashReuses=1
            ),
            app_ui_model_mutations=AppUIModelMutationMetrics(
                requests=1, operations=1, changedPaths=2
            ),
            activities=(),
        )

    monkeypatch.setattr(
        "agent_ui_creator.server._domain_write_agent_result", fake_result
    )
    client = TestClient(
        create_app(settings), headers={"Authorization": f"Bearer {settings.auth_token}"}
    )
    response = client.post(
        "/creator",
        json={
            "threadId": "thread-1",
            "runId": "run-1",
            "messages": [{"role": "user", "content": "register plugin"}],
        },
    )

    assert '"phase":"domain-write-agent"' in response.text
    assert '"runtime":"python"' in response.text
    assert '"agentMode":"domain-write"' in response.text
    assert '"mutate_app_ui_model":1' in response.text
    assert '"appUIModelMutations":{"requests":1,"operations":1' in response.text
    assert '"domainObservations":{"updates":2,"hashReuses":1' in response.text
    assert '"changedPaths":2' in response.text
    assert '"status":"not-run"' in response.text
