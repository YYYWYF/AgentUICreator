from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest
from deepagents import create_deep_agent
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage
from langchain_core.tools import tool
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command
from pydantic import ValidationError

from agent_ui_creator.human_input import QuestionAnswers, QuestionRequest, ask_user_question
from agent_ui_creator.config import CreatorServerSettings
from agent_ui_creator.server import _checkpoint_input_messages, create_app
from agent_ui_creator.streaming.deepagent_v3_runner import (
    DeepAgentCompleted, DeepAgentInterrupted, DeepAgentV3Runner,
)
from agent_ui_creator.model_protocol.trace import ToolProtocolMetrics
from agent_ui_creator.domain_state.observation_context import DomainObservationMetrics


REQUEST = {"schemaVersion": 1, "steps": [{
    "id": "layout", "question": "Layout?", "selectionMode": "single",
    "minSelections": 1, "maxSelections": 1,
    "options": [{"id": "dashboard", "label": "Dashboard"}, {"id": "sidebar", "label": "Sidebar"}],
}]}


class ToolCallingModel(FakeMessagesListChatModel):
    def bind_tools(self, tools, **kwargs):
        return self


def test_question_contract_rejects_duplicate_ids_and_invalid_selection():
    request = QuestionRequest.model_validate(REQUEST)
    assert QuestionAnswers(answers={"layout": ["sidebar"]}).validate_for(request).answers == {"layout": ["sidebar"]}
    with pytest.raises(ValidationError):
        QuestionRequest.model_validate({**REQUEST, "steps": [REQUEST["steps"][0], REQUEST["steps"][0]]})
    with pytest.raises(ValidationError):
        QuestionRequest.model_validate({**REQUEST, "steps": [{**REQUEST["steps"][0],
            "options": [REQUEST["steps"][0]["options"][0]] * 2}]})
    for selected in ([], ["dashboard", "sidebar"], ["missing"]):
        with pytest.raises(ValueError):
            QuestionAnswers(answers={"layout": selected}).validate_for(request)


def test_human_tool_pauses_graph_and_resumes_before_mutation():
    async def scenario():
        changed: list[str] = []

        @tool
        def record_choice(choice: str) -> str:
            """Record the chosen layout."""
            changed.append(choice)
            return choice

        model = ToolCallingModel(responses=[
            AIMessage(content="", tool_calls=[{"name": "ask_user_question", "args": REQUEST, "id": "ask-1"}]),
            AIMessage(content="", tool_calls=[{"name": "record_choice", "args": {"choice": "sidebar"}, "id": "write-1"}]),
            AIMessage(content="Done"),
        ])
        graph = create_deep_agent(model=model, tools=[ask_user_question, record_choice],
            checkpointer=InMemorySaver(), subagents=[])
        config = {"recursion_limit": 30, "configurable": {"thread_id": "creator-thread"}}
        runner = DeepAgentV3Runner()
        paused = await runner.run_result(graph=graph, input={"messages": [{"role": "user", "content": "Design"}]},
            config=config, event_sink=None)
        assert isinstance(paused, DeepAgentInterrupted)
        assert paused.interrupts[0]["value"]["kind"] == "ask_user_question"
        assert changed == []
        completed = await runner.run_result(graph=graph,
            input=Command(resume={"answers": {"layout": ["sidebar"]}}), config=config, event_sink=None)
        assert isinstance(completed, DeepAgentCompleted)
        assert changed == ["sidebar"]

    asyncio.run(scenario())


def test_resume_after_sidecar_restart_has_stable_stale_error(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    monkeypatch.setenv("CREATOR_PYTHON_AGENT_MODE", "domain-read")
    settings = CreatorServerSettings(project_root=tmp_path, skills_root=tmp_path, auth_token="x" * 32)
    client = TestClient(create_app(settings), headers={"Authorization": f"Bearer {settings.auth_token}"})
    response = client.post("/creator", json={
        "threadId": "old-thread", "runId": "resume-run", "messages": [],
        "forwardedProps": {"command": {"resume": {"interruptId": "old-interrupt",
            "answers": {"layout": ["dashboard"]}}}},
    })
    assert response.status_code == 200
    assert "CREATOR_INTERRUPT_NOT_FOUND" in response.text


def test_fresh_turn_uses_only_new_user_message_after_checkpoint():
    class ExistingCheckpoint:
        async def aget_tuple(self, _config):
            return object()

    messages = [{"role": "user", "content": "old"}, {"role": "assistant", "content": "answer"},
                {"role": "user", "content": "new"}]
    assert asyncio.run(_checkpoint_input_messages(ExistingCheckpoint(), "thread", messages)) == [messages[-1]]


def test_http_interrupt_resume_and_pending_guards(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    monkeypatch.setenv("CREATOR_PYTHON_AGENT_MODE", "domain-read")
    settings = CreatorServerSettings(project_root=tmp_path, skills_root=tmp_path, auth_token="x" * 32)
    changed: list[str] = []
    checkpoints: list[object] = []
    graph = None

    @tool
    def record_choice(choice: str) -> str:
        """Record the chosen layout."""
        changed.append(choice)
        return choice

    model = ToolCallingModel(responses=[
        AIMessage(content="", tool_calls=[{"name": "ask_user_question", "args": REQUEST, "id": "ask-1"}]),
        AIMessage(content="", tool_calls=[{"name": "record_choice", "args": {"choice": "sidebar"}, "id": "write-1"}]),
        AIMessage(content="Done"),
    ])

    async def fake_result(_settings, messages, _activity, thread_id, event_sink, _telemetry, *, checkpointer, resume, **_kwargs):
        nonlocal graph
        checkpoints.append(checkpointer)
        if graph is None:
            graph = create_deep_agent(model=model, tools=[ask_user_question, record_choice],
                checkpointer=checkpointer, subagents=[])
        result = await DeepAgentV3Runner().run_result(graph=graph,
            input=Command(resume=resume) if resume is not None else {"messages": messages},
            config={"recursion_limit": 30, "configurable": {"thread_id": thread_id}}, event_sink=event_sink)
        if isinstance(result, DeepAgentInterrupted):
            return result
        return SimpleNamespace(text="Done", metrics=ToolProtocolMetrics(),
            project_control=SimpleNamespace(to_dict=lambda: {}), repeated_project_control_reads=0,
            domain_observations=DomainObservationMetrics())

    monkeypatch.setattr("agent_ui_creator.server._domain_read_agent_result", fake_result)
    app = create_app(settings)
    client = TestClient(app, headers={"Authorization": f"Bearer {settings.auth_token}"})

    def events(thread: str, run: str, *, command=None, messages=None):
        response = client.post("/creator", json={"threadId": thread, "runId": run,
            "messages": messages if messages is not None else [],
            **({"forwardedProps": {"command": command}} if command is not None else {})})
        assert response.status_code == 200
        return [json.loads(line.removeprefix("data: ")) for line in response.text.splitlines() if line.startswith("data: ")]

    initial = events("thread-1", "run-1", messages=[{"id": "user-1", "role": "user", "content": "Design"}])
    assert [event["type"] for event in initial if event["type"] in {"CUSTOM", "RUN_FINISHED"}] == ["CUSTOM", "RUN_FINISHED"]
    interrupt = next(event["value"] for event in initial if event.get("name") == "on_interrupt")
    assert interrupt["metadata"]["kind"] == "ask_user_question"
    assert changed == []
    answer = {"interruptId": interrupt["id"], "answers": {"layout": ["sidebar"]}}
    restarted = TestClient(create_app(settings), headers={"Authorization": f"Bearer {settings.auth_token}"})
    stale = restarted.post("/creator", json={"threadId": "thread-1", "runId": "after-restart",
        "messages": [], "forwardedProps": {"command": {"resume": answer}}})
    assert "CREATOR_INTERRUPT_NOT_FOUND" in stale.text

    for thread, resume, expected in [
        ("wrong-thread", answer, "CREATOR_INTERRUPT_NOT_FOUND"),
        ("thread-1", {**answer, "interruptId": "wrong-id"}, "CREATOR_INTERRUPT_INVALID_ANSWER"),
        ("thread-1", {**answer, "answers": {"layout": ["missing"]}}, "CREATOR_INTERRUPT_INVALID_ANSWER"),
    ]:
        assert any(event.get("code") == expected for event in events(thread, "bad-run", command={"resume": resume}))
    assert any(event.get("code") == "CREATOR_INTERRUPT_PENDING" for event in events("thread-1", "normal-run",
        messages=[{"role": "user", "content": "Continue without answering"}]))
    assert changed == []

    completed = events("thread-1", "run-2", command={"resume": answer})
    assert changed == ["sidebar"]
    assert checkpoints == [app.state.creator_checkpointer, app.state.creator_checkpointer]
    assert any(event["type"] == "TEXT_MESSAGE_CONTENT" and event["delta"] == "Done" for event in completed)
    assert completed[-1]["type"] == "RUN_FINISHED"
    assert "thread-1" not in app.state.pending_creator_questions
