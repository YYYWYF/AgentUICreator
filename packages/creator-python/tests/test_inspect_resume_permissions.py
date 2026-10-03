from __future__ import annotations

import asyncio
import json
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage

from agent_ui_creator.config import CreatorServerSettings
from agent_ui_creator.domain_agent import create_domain_read_creator_agent
from agent_ui_creator.domain_agent.tool_policy import SIDE_EFFECT_TOOL_NAMES
from agent_ui_creator.minimal_agent.path_policy import PolicyFilesystemBackend
from agent_ui_creator.model_protocol.errors import ToolPermissionDeniedError
from agent_ui_creator.operations import (
    CreatorActionSelection,
    CreatorIntentPresentation,
    CreatorResolveResult,
)
from agent_ui_creator.server import create_app


QUESTION = {"schemaVersion": 1, "steps": [{
    "id": "choice", "question": "Continue?", "selectionMode": "single",
    "minSelections": 1, "maxSelections": 1,
    "options": [{"id": "yes", "label": "Yes"}, {"id": "no", "label": "No"}],
}]}


class TrackingModel(FakeMessagesListChatModel):
    def bind_tools(self, tools, **_kwargs):
        offered = list(getattr(self, "offered_tools", []))
        offered.append(sorted(tool.name for tool in tools))
        object.__setattr__(self, "offered_tools", offered)
        return self


def _selection(route: str) -> CreatorResolveResult:
    read_only = route in {"read_only_general", "answer_only"}
    decision = "answer_only" if route == "answer_only" else "read_only_analysis" if read_only else "general_change"
    return CreatorResolveResult(
        route=route,
        selection=CreatorActionSelection(decision=decision),
        presentation=CreatorIntentPresentation(
            label="Inspect" if read_only else "Edit",
            kind=decision,
            target_plugin_ids=(),
            target_instance_ids=(),
            route=route,
        ),
    )


def _client(tmp_path, monkeypatch, model, *, route="read_only_general"):
    monkeypatch.setenv("CREATOR_PYTHON_AGENT_MODE", "domain-write")
    monkeypatch.setenv("CREATOR_MODEL_BASE_URL", "http://127.0.0.1:9/v1")
    monkeypatch.setenv("CREATOR_MODEL_API_KEY", "test-only")
    monkeypatch.setattr(
        "agent_ui_creator.model_factory.create_creator_chat_model",
        lambda *_args, **_kwargs: model,
    )

    class FixedSelector:
        def __init__(self, **_kwargs):
            self.telemetry = _kwargs.get("telemetry")

        async def run(self, messages):
            selected_route = route(messages) if callable(route) else route
            result = _selection(selected_route)
            if self.telemetry is not None:
                self.telemetry.bind(
                    operation_route={"route": selected_route},
                    operation_presentation=result.presentation.to_dict(),
                )
            return result

    monkeypatch.setattr("agent_ui_creator.server.ProductizedOperationEngine", FixedSelector)
    settings = CreatorServerSettings(
        project_root=tmp_path, skills_root=tmp_path, auth_token="x" * 32,
    )
    app = create_app(settings)
    return app, TestClient(app, headers={"Authorization": f"Bearer {settings.auth_token}"})


def _events(client, thread, run, *, resume=None, text=None):
    response = client.post("/creator", json={
        "threadId": thread, "runId": run,
        "messages": ([{"role": "user", "content": text}] if text else []),
        **({"forwardedProps": {"command": {"resume": resume}}} if resume else {}),
    })
    assert response.status_code == 200
    return [json.loads(line.removeprefix("data: "))
            for line in response.text.splitlines() if line.startswith("data: ")]


def _question(events):
    return next(event["value"] for event in events if event.get("name") == "on_interrupt")


def _answer(question):
    return {"interruptId": question["id"], "answers": {"choice": ["yes"]}}


def test_answer_only_streams_without_project_tools_or_mutation(tmp_path, monkeypatch):
    model = TrackingModel(responses=[
        AIMessage(content="我可以解释、检查、规划和修改 Agent UI。"),
    ])
    _app, client = _client(tmp_path, monkeypatch, model, route="answer_only")

    events = _events(client, "thread-answer", "run-answer", text="你能做什么？")
    finished = next(event for event in events if event["type"] == "RUN_FINISHED")
    assert finished["result"]["creatorIntent"]["route"] == "answer_only"
    assert finished["result"]["executionPolicy"] == "read-only"
    assert finished["result"].get("mutationAttempts", 0) == 0
    assert "productizedOperation" not in finished["result"]
    assert finished["result"]["projectControl"]["requests"] == 0
    assert all(not trace["offeredToolNames"]
               for trace in finished["result"]["toolProtocol"]["traces"])
    assert any("我可以解释" in event.get("delta", "") for event in events)


def test_answer_only_agent_can_be_constructed_with_deepagents_filesystem_contract(tmp_path):
    agent = create_domain_read_creator_agent(
        model=TrackingModel(responses=[AIMessage(content="I can help with Agent UI.")]),
        workspace=tmp_path,
        permission_scope="inspect_read_only",
        answer_only=True,
    )

    assert agent.graph is not None


def test_answer_only_rejects_unoffered_read_file_before_execution(tmp_path, monkeypatch):
    target = tmp_path / "plugins" / "existing.ts"
    target.parent.mkdir()
    original = 'export const name = "original";\n'
    target.write_text(original)
    reads = []

    def track_read(self, path, *args, **kwargs):
        reads.append(path)
        raise AssertionError("answer-only must not read project files")

    monkeypatch.setattr(PolicyFilesystemBackend, "read", track_read)
    model = TrackingModel(responses=[AIMessage(content="", tool_calls=[
        {"name": "read_file", "args": {"file_path": "/plugins/existing.ts"}, "id": "injected-read"},
    ])])
    agent = create_domain_read_creator_agent(
        model=model, workspace=tmp_path, permission_scope="inspect_read_only",
        answer_only=True,
    )

    with pytest.raises(ToolPermissionDeniedError, match="TOOL_PERMISSION_DENIED"):
        asyncio.run(agent.run("What can you do?"))
    assert agent.protocol.metrics.traces
    assert all(not trace.offeredToolNames for trace in agent.protocol.metrics.traces)
    assert reads == []
    assert target.read_text() == original
    assert agent.project_control.metrics.requests == 0
    assert agent.activity.revision == 0


def test_inspect_question_resumes_read_only_with_read_only_receipt(tmp_path, monkeypatch):
    target = tmp_path / "plugins" / "existing.ts"
    target.parent.mkdir()
    target.write_text('export const name = "original";\n')
    model = TrackingModel(responses=[
        AIMessage(content="", tool_calls=[
            {"name": "ask_user_question", "args": QUESTION, "id": "ask-read"},
        ]),
        AIMessage(content="The existing plugin is present."),
    ])
    app, client = _client(tmp_path, monkeypatch, model)
    first = _events(client, "thread-read", "run-read-1", text="Inspect the UI")
    question = _question(first)
    pending = app.state.pending_creator_questions["thread-read"]
    assert pending.permission == "inspect_read_only"
    assert pending.checkpoint_id
    before_resume = len(model.offered_tools)

    resumed = _events(client, "thread-read", "run-read-2", resume={
        **_answer(question), "executionPermission": "domain_write",
    })
    resumed_tools = model.offered_tools[before_resume:]
    assert resumed_tools
    assert all(not SIDE_EFFECT_TOOL_NAMES.intersection(tools) for tools in resumed_tools)
    finished = next(event for event in resumed if event["type"] == "RUN_FINISHED")
    assert finished["result"]["executionPolicy"] == "read-only"
    assert finished["result"]["phase"] == "domain-read-agent"
    assert any(event.get("delta") == "The existing plugin is present." for event in resumed)
    assert target.read_text() == 'export const name = "original";\n'
    assert "thread-read" not in app.state.pending_creator_questions
    print("PERMISSION_EVIDENCE=" + json.dumps({
        "case": "inspect-complete", "permissionBefore": pending.permission,
        "offeredBefore": model.offered_tools[0],
        "offeredAfter": resumed_tools[0],
        "executionPolicyAfter": finished["result"]["executionPolicy"],
    }, sort_keys=True))


def test_inspect_resume_rejects_injected_edit_and_preserves_file(tmp_path, monkeypatch):
    target = tmp_path / "plugins" / "existing.ts"
    target.parent.mkdir()
    original = 'export const name = "original";\n'
    target.write_text(original)
    model = TrackingModel(responses=[
        AIMessage(content="", tool_calls=[
            {"name": "ask_user_question", "args": QUESTION, "id": "ask-read"},
        ]),
        AIMessage(content="", tool_calls=[
            {"name": "edit_file", "args": {
                "file_path": "/plugins/existing.ts", "old_string": "original",
                "new_string": "changed",
            }, "id": "injected-edit"},
        ]),
    ])
    app, client = _client(tmp_path, monkeypatch, model)
    question = _question(_events(client, "thread-deny", "run-deny-1", text="Inspect the UI"))
    before_resume = len(model.offered_tools)
    resumed = _events(client, "thread-deny", "run-deny-2", resume=_answer(question))
    assert any(event.get("code") == "TOOL_PERMISSION_DENIED" for event in resumed)
    assert all(not SIDE_EFFECT_TOOL_NAMES.intersection(tools)
               for tools in model.offered_tools[before_resume:])
    assert target.read_text() == original
    assert app.state.pending_creator_questions["thread-deny"].permission == "inspect_read_only"
    print("PERMISSION_EVIDENCE=" + json.dumps({
        "case": "inspect-injected-edit", "permissionAfter": "inspect_read_only",
        "offeredAfter": model.offered_tools[before_resume],
        "errorCodes": [event["code"] for event in resumed if event["type"] == "RUN_ERROR"],
        "fileUnchanged": True,
    }, sort_keys=True))


def test_write_question_resumes_with_original_write_permission(tmp_path, monkeypatch):
    target = tmp_path / "plugins" / "existing.ts"
    target.parent.mkdir()
    target.write_text('export const name = "original";\n')
    model = TrackingModel(responses=[
        AIMessage(content="", tool_calls=[
            {"name": "ask_user_question", "args": QUESTION, "id": "ask-read-first"},
        ]),
        AIMessage(content="Read-only inspection is complete."),
        AIMessage(content="", tool_calls=[
            {"name": "ask_user_question", "args": QUESTION, "id": "ask-write"},
        ]),
        AIMessage(content="", tool_calls=[
            {"name": "read_file", "args": {"file_path": "/plugins/existing.ts"}, "id": "read"},
        ]),
        AIMessage(content="", tool_calls=[
            {"name": "edit_file", "args": {
                "file_path": "/plugins/existing.ts", "old_string": "original",
                "new_string": "changed",
            }, "id": "edit"},
        ]),
        AIMessage(content="The requested edit is complete."),
    ])
    app, client = _client(
        tmp_path, monkeypatch, model,
        route=lambda messages: (
            "read_only_general" if messages[-1]["content"].startswith("Inspect")
            else "unscoped_general"
        ),
    )
    first_question = _question(_events(client, "thread-write", "run-read-1", text="Inspect the plugin"))
    read_completed = _events(client, "thread-write", "run-read-2", resume=_answer(first_question))
    assert next(event for event in read_completed if event["type"] == "RUN_FINISHED")["result"]["executionPolicy"] == "read-only"
    question = _question(_events(client, "thread-write", "run-write-1", text="Edit the plugin"))
    pending = app.state.pending_creator_questions["thread-write"]
    assert pending.permission == "domain_write"
    before_resume = len(model.offered_tools)
    resumed = _events(client, "thread-write", "run-write-2", resume=_answer(question))
    assert any("edit_file" in tools for tools in model.offered_tools[before_resume:])
    assert target.read_text() == 'export const name = "changed";\n'
    assert not any(event["type"] == "RUN_ERROR" for event in resumed)
    assert "thread-write" not in app.state.pending_creator_questions
    print("PERMISSION_EVIDENCE=" + json.dumps({
        "case": "write-complete", "permissionBefore": pending.permission,
        "offeredAfter": model.offered_tools[before_resume], "fileChanged": True,
    }, sort_keys=True))


def test_resume_rejects_invalid_permission_or_checkpoint(tmp_path, monkeypatch):
    model = TrackingModel(responses=[AIMessage(content="", tool_calls=[
        {"name": "ask_user_question", "args": QUESTION, "id": "ask-read"},
    ])])
    app, client = _client(tmp_path, monkeypatch, model)
    question = _question(_events(client, "thread-stale", "run-stale-1", text="Inspect the UI"))
    pending = app.state.pending_creator_questions["thread-stale"]
    app.state.pending_creator_questions["thread-stale"] = replace(
        pending, permission="domain_read_legacy",
    )
    rejected = _events(client, "thread-stale", "run-stale-2", resume=_answer(question))
    assert any(event.get("code") == "CREATOR_INTERRUPT_CONTEXT_INVALID" for event in rejected)
    assert "thread-stale" not in app.state.pending_creator_questions

    question = _question(_events(client, "thread-stale", "run-stale-3", text="Inspect the UI"))
    pending = app.state.pending_creator_questions["thread-stale"]
    app.state.pending_creator_questions["thread-stale"] = replace(
        pending, checkpoint_id="stale-checkpoint",
    )
    rejected = _events(client, "thread-stale", "run-stale-4", resume=_answer(question))
    assert any(event.get("code") == "CREATOR_INTERRUPT_CONTEXT_INVALID" for event in rejected)
    assert "thread-stale" not in app.state.pending_creator_questions

    question = _question(_events(client, "thread-stale", "run-stale-5", text="Inspect the UI"))
    pending = app.state.pending_creator_questions["thread-stale"]
    app.state.pending_creator_questions["thread-stale"] = replace(
        pending, permission=None,
    )
    rejected = _events(client, "thread-stale", "run-stale-6", resume=_answer(question))
    assert any(event.get("code") == "CREATOR_INTERRUPT_CONTEXT_INVALID" for event in rejected)
