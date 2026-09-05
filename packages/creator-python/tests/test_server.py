import asyncio
import json
from fastapi.testclient import TestClient
from types import SimpleNamespace

from agent_ui_creator.config import CreatorServerSettings
from agent_ui_creator.model_protocol import ToolProtocolMetrics
from agent_ui_creator.model_protocol.errors import ModelToolProtocolError
from agent_ui_creator.app_ui_model import AppUIModelMutationMetrics
from agent_ui_creator.domain_state import DomainObservationMetrics
from agent_ui_creator.server import AgUiRunInput, _conversation_messages, create_app
from agent_ui_creator.streaming import ToolInvocationFinished, ToolInvocationStarted


def test_conversation_messages_keeps_only_nonempty_user_and_assistant_text():
    run_input = AgUiRunInput(
        threadId="thread-1",
        runId="run-2",
        messages=[
            {"role": "system", "content": "untrusted system instructions"},
            {"role": "user", "content": "  A  ", "id": "user-1"},
            {"role": "assistant", "content": " B ", "toolCalls": [{"id": "old"}]},
            {"role": "tool", "content": "old result", "toolCallId": "old"},
            {"role": "developer", "content": "untrusted developer instructions"},
            {"role": "assistant", "content": " \n "},
            {"role": "assistant", "content": [{"type": "text", "text": "ignored"}]},
            {"role": "user", "content": None},
            {"role": "user", "content": 123},
            {"role": "assistant"},
            {"content": "missing role"},
            {"role": "user", "content": "C"},
        ],
    )

    assert _conversation_messages(run_input) == [
        {"role": "user", "content": "A"},
        {"role": "assistant", "content": "B"},
        {"role": "user", "content": "C"},
    ]


def test_conversation_messages_bounds_valid_messages_in_original_order():
    messages = [
        {"role": "user" if index % 2 == 0 else "assistant", "content": str(index)}
        for index in range(10)
    ]
    run_input = AgUiRunInput(
        threadId="thread-1",
        runId="run-2",
        messages=messages + [{"role": "tool", "content": "ignored"}] * 7,
    )

    assert _conversation_messages(run_input) == messages[-6:]


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

    async def fake_result(_settings, _prompt, _activity, event_sink):
        await event_sink.publish(
            ToolInvocationStarted(
                call_id="call-1",
                name="read_file",
                arguments={"file_path": "/plugins/a.ts"},
            )
        )
        await event_sink.publish(
            ToolInvocationFinished(
                call_id="call-1",
                result="1: old",
                status="success",
            )
        )
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


def test_server_sends_tool_start_before_delayed_tool_finishes(tmp_path, monkeypatch):
    monkeypatch.setenv("CREATOR_PYTHON_AGENT_MODE", "minimal")
    settings = CreatorServerSettings(
        project_root=tmp_path,
        skills_root=tmp_path,
        auth_token="x" * 32,
    )
    metrics = ToolProtocolMetrics(modelCalls=2, toolCalls=1, validToolCalls=1)
    allow_finish = asyncio.Event()
    handler_finished = asyncio.Event()
    start_sent = asyncio.Event()

    async def fake_result(_settings, _prompt, _activity, event_sink):
        await event_sink.publish(
            ToolInvocationStarted("call-delayed", "read_file", {"file_path": "/a"})
        )
        await allow_finish.wait()
        handler_finished.set()
        await event_sink.publish(
            ToolInvocationFinished("call-delayed", "done", "success")
        )
        return SimpleNamespace(
            text="Finished.",
            metrics=metrics,
            activities=(
                SimpleNamespace(
                    callId="call-delayed",
                    name="read_file",
                    arguments={"file_path": "/a"},
                    status="success",
                    result="done",
                ),
            ),
        )

    monkeypatch.setattr("agent_ui_creator.server._minimal_agent_result", fake_result)
    app = create_app(settings)
    request_body = json.dumps(
        {
            "threadId": "thread-stream",
            "runId": "run-stream",
            "messages": [{"role": "user", "content": "read"}],
        }
    ).encode()

    async def scenario() -> None:
        request_delivered = False
        response_messages = []
        never_disconnect = asyncio.Event()

        async def receive():
            nonlocal request_delivered
            if not request_delivered:
                request_delivered = True
                return {
                    "type": "http.request",
                    "body": request_body,
                    "more_body": False,
                }
            await never_disconnect.wait()
            raise AssertionError("unreachable")

        async def send(message):
            response_messages.append(message)
            if (
                message["type"] == "http.response.body"
                and b'"type":"TOOL_CALL_START"' in message.get("body", b"")
            ):
                start_sent.set()

        scope = {
            "type": "http",
            "asgi": {"version": "3.0", "spec_version": "2.4"},
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": "/creator",
            "raw_path": b"/creator",
            "query_string": b"",
            "root_path": "",
            "headers": [
                (b"authorization", f"Bearer {settings.auth_token}".encode()),
                (b"content-type", b"application/json"),
                (b"accept", b"text/event-stream"),
            ],
            "client": ("127.0.0.1", 1234),
            "server": ("127.0.0.1", 80),
            "state": {},
        }
        request_task = asyncio.create_task(app(scope, receive, send))
        await asyncio.wait_for(start_sent.wait(), timeout=0.5)
        assert not handler_finished.is_set()
        assert not request_task.done()
        allow_finish.set()
        await asyncio.wait_for(request_task, timeout=1)

        wire = b"".join(
            message.get("body", b"")
            for message in response_messages
            if message["type"] == "http.response.body"
        ).decode()
        event_types = [
            json.loads(block.removeprefix("data: "))["type"]
            for block in wire.strip().split("\n\n")
        ]
        assert event_types == [
            "RUN_STARTED",
            "TOOL_CALL_START",
            "TOOL_CALL_ARGS",
            "TOOL_CALL_END",
            "TOOL_CALL_RESULT",
            "TEXT_MESSAGE_START",
            "TEXT_MESSAGE_CONTENT",
            "TEXT_MESSAGE_END",
            "RUN_FINISHED",
        ]

    asyncio.run(scenario())


def test_minimal_mode_propagates_protocol_failure_as_run_error(tmp_path, monkeypatch):
    monkeypatch.setenv("CREATOR_PYTHON_AGENT_MODE", "minimal")
    settings = CreatorServerSettings(
        project_root=tmp_path,
        skills_root=tmp_path,
        auth_token="x" * 32,
    )

    async def fail(_settings, _prompt, _activity, _event_sink):
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
    assert '"type":"RUN_FINISHED"' not in response.text


def test_domain_read_mode_streams_project_control_metrics(tmp_path, monkeypatch):
    monkeypatch.setenv("CREATOR_PYTHON_AGENT_MODE", "domain-read")
    settings = CreatorServerSettings(
        project_root=tmp_path,
        skills_root=tmp_path,
        auth_token="x" * 32,
    )
    metrics = ToolProtocolMetrics(modelCalls=2, toolCalls=1, validToolCalls=1)

    async def fake_result(_settings, _prompt, _activity, _event_sink):
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

    async def fake_result(
        _settings, _prompt, _activity, _coordinator, _event_sink
    ):
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
