from __future__ import annotations

import asyncio
import json
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from pydantic import PrivateAttr

from agent_ui_creator.config import CreatorServerSettings
from agent_ui_creator.project_control import ProjectControlClient
from agent_ui_creator.server import create_app
from agent_ui_creator.validation.models import CommandExecutionResult

ROOT = Path(__file__).resolve().parents[3]


class _TrackingModelState:
    def __init__(self):
        self.response_index = 0
        self.offered_tools: list[set[str]] = []


class TrackingModel(FakeMessagesListChatModel):
    _shared_state: _TrackingModelState = PrivateAttr(default_factory=_TrackingModelState)

    @property
    def response_index(self) -> int:
        return self._shared_state.response_index

    @property
    def offered_tools(self) -> list[set[str]]:
        return self._shared_state.offered_tools

    def model_copy(self, *, update=None, deep=False):
        copied = super().model_copy(update=update, deep=deep)
        # Every clone belongs to the same scripted model session.
        copied._shared_state = self._shared_state
        return copied

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        index = self._shared_state.response_index
        if index >= len(self.responses):
            raise AssertionError(f"TrackingModel exhausted scripted responses at index {index}")
        response = self.responses[index]
        self._shared_state.response_index += 1
        return ChatResult(generations=[ChatGeneration(message=response)])

    def bind_tools(self, tools, **_kwargs):
        self._shared_state.offered_tools.append({tool.name for tool in tools})
        return self


@pytest.mark.parametrize("deep", [False, True])
def test_tracking_model_copies_share_scripted_response_cursor(deep):
    model = TrackingModel(responses=[AIMessage(content="first"), AIMessage(content="second")])
    selector_copy = model.model_copy(update={"streaming": False}, deep=deep)

    first = asyncio.run(selector_copy.ainvoke([]))
    second = asyncio.run(model.ainvoke([]))

    assert selector_copy._shared_state is model._shared_state
    assert first.content == "first"
    assert second.content == "second"
    assert model.response_index == 2


def test_tracking_model_fails_when_scripted_responses_are_exhausted():
    model = TrackingModel(responses=[AIMessage(content="only")])
    asyncio.run(model.ainvoke([]))

    with pytest.raises(AssertionError, match="exhausted scripted responses"):
        asyncio.run(model.ainvoke([]))


def call(name, args, identifier):
    return AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": identifier}])


@pytest.fixture(scope="module", autouse=True)
def build_host_runtime():
    subprocess.run(["pnpm", "--filter", "@agent-ui/project-control", "build"], cwd=ROOT, check=True, capture_output=True)


@pytest.mark.parametrize("choice", ["hide", "purge"])
def test_selector_question_interrupt_answer_and_real_host_removal(tmp_path, monkeypatch, choice):
    # All mutations run through the actual compiled ProjectControl against a
    # disposable official preset. Only the model and external typecheck command
    # are fixtures; this does not exercise a live model or frontend acceptance.
    subprocess.run(["pnpm", "--filter", "@agent-ui/project-control", "exec", "tsx",
                    "tests/support/create-removal-host.ts", str(tmp_path)], cwd=ROOT, check=True, capture_output=True)
    project_control = ProjectControlClient(project_root=tmp_path)
    model_before = asyncio.run(project_control.inspect_app_ui_model())
    sources_before = asyncio.run(project_control.inspect_agent_ui_sources())
    composition_file = tmp_path / "agent-ui/app-ui/app-ui.json"
    lock_file = tmp_path / ".agent-ui/source-lock.json"
    original_composition = composition_file.read_bytes()
    original_lock = lock_file.read_bytes()
    plugin_root = tmp_path / "agent-ui/plugins/assistant-ui-slash-command-trigger"
    original_source = {file: file.read_bytes() for file in plugin_root.rglob("*") if file.is_file()}
    question = {"steps": [{
        "id": "plugin-removal", "question": "隐藏还是彻底删除？", "selectionMode": "single",
        "minSelections": 1, "maxSelections": 1,
        "options": [{"id": "hide", "label": "隐藏"}, {"id": "purge", "label": "彻底删除"}],
    }]}
    responses = [AIMessage(content="MODIFY GENERAL REMOVAL_UNCERTAIN"),
                 call("ask_user_question", question, "question"), call("inspect_app_ui_model", {}, "inspect-model")]
    if choice == "hide":
        responses.append(call("mutate_app_ui_model", {"appUIModelHash": model_before["hash"], "operations": [
            {"type": "set_plugin_enabled", "instanceId": "assistant-ui-slash-command-trigger-main", "enabled": False},
        ]}, "hide"))
    else:
        responses.extend([call("inspect_agent_ui_sources", {}, "inspect-sources"), call("purge_ui_plugin", {
            "pluginId": "assistant-ui-slash-command-trigger", "appUIModelHash": model_before["hash"],
            "sourceStateHash": sources_before["stateHash"],
        }, "purge")])
    responses.append(AIMessage(content="已完成。"))
    model = TrackingModel(responses=responses)
    monkeypatch.setenv("CREATOR_PYTHON_AGENT_MODE", "domain-write")
    monkeypatch.setenv("CREATOR_MODEL_BASE_URL", "http://127.0.0.1:9/v1")
    monkeypatch.setenv("CREATOR_MODEL_API_KEY", "test-only")
    monkeypatch.setattr("agent_ui_creator.model_factory.create_creator_chat_model", lambda *_args, **_kwargs: model)

    async def typecheck_fixture(_self, _command):
        return CommandExecutionResult("", 0, False)
    monkeypatch.setattr("agent_ui_creator.validation.command_runner.CreatorValidationCommandRunner.execute_known_command", typecheck_fixture)
    settings = CreatorServerSettings(project_root=tmp_path, skills_root=ROOT / "packages/creator/skills", auth_token="x" * 32)
    app = create_app(settings)
    client = TestClient(app, headers={"Authorization": f"Bearer {settings.auth_token}"})

    def events(run, *, text=None, resume=None):
        response = client.post("/creator", json={"threadId": "removal-thread", "runId": run,
            "messages": [{"role": "user", "content": text}] if text else [],
            **({"forwardedProps": {"command": {"resume": resume}}} if resume else {})})
        assert response.status_code == 200
        return [json.loads(line.removeprefix("data: ")) for line in response.text.splitlines() if line.startswith("data: ")]

    initial = events("ask", text="把 Slash Command 去掉")
    assert not [event for event in initial if event["type"] == "RUN_ERROR"], initial
    envelope = next(event["value"] for event in initial if event.get("name") == "on_interrupt")
    assert envelope["metadata"]["steps"][0]["id"] == "plugin-removal"
    assert app.state.pending_creator_questions["removal-thread"].removal_intent == "uncertain"
    assert app.state.pending_creator_clarifications.peek("removal-thread") is not None
    assert model.offered_tools and all(offered == {"ask_user_question"} for offered in model.offered_tools)
    initial_model_calls = len(model.offered_tools)
    assert composition_file.read_bytes() == original_composition
    assert lock_file.read_bytes() == original_lock
    for file, content in original_source.items():
        assert file.read_bytes() == content

    completed = events("answer", resume={"interruptId": envelope["id"], "answers": {"plugin-removal": [choice]}})
    assert not [event for event in completed if event["type"] == "RUN_ERROR"], completed
    assert completed[-1]["type"] == "RUN_FINISHED"
    permitted = "mutate_app_ui_model" if choice == "hide" else "purge_ui_plugin"
    for offered in model.offered_tools[initial_model_calls:]:
        assert not {"edit_file", "edit_file_from_read", "mutate_ui_plugin_source", "apply_agent_ui_source_item"}.intersection(offered)
        assert ({"mutate_app_ui_model", "purge_ui_plugin"} - {permitted}).isdisjoint(offered)
    if choice == "hide":
        expected_model = json.loads(original_composition)
        disabled_instances = []
        def disable_target(value):
            if isinstance(value, dict):
                if value.get("id") == "assistant-ui-slash-command-trigger-main":
                    value["enabled"] = False
                    disabled_instances.append(value["id"])
                for child in value.values():
                    disable_target(child)
            elif isinstance(value, list):
                for child in value:
                    disable_target(child)
        disable_target(expected_model)
        assert disabled_instances == ["assistant-ui-slash-command-trigger-main"]
        assert json.loads(composition_file.read_text()) == expected_model
        assert lock_file.read_bytes() == original_lock
        for file, content in original_source.items():
            assert file.read_bytes() == content
    else:
        assert not plugin_root.exists()
        assert "plugin/assistant-ui-slash-command-trigger" not in json.loads(lock_file.read_text())["items"]
        assert "assistant-ui-slash-command-trigger" not in composition_file.read_text()
    assert "removal-thread" not in app.state.pending_creator_questions
    assert app.state.pending_creator_clarifications.peek("removal-thread") is None
    assert model.response_index == len(responses)
