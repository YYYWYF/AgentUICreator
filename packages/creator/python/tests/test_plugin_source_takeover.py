from __future__ import annotations

import copy
import json
from typing import TypedDict
from unittest.mock import AsyncMock

import pytest
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

from agent_ui_creator.domain_tools.operator_tools import create_operator_tools
from agent_ui_creator.human_input.plugin_source_messages import MESSAGES
from agent_ui_creator.domain_agent.tool_policy import filter_domain_read_tools, filter_domain_write_tools


class State(TypedDict, total=False):
    result: str


def setup(locale="zh-CN", plugin_id="composer"):
    plan = {"pluginId": plugin_id, "package": {"name": "@za38.03/agent-ui-plugins", "version": "1.2.3"},
            "pluginVersion": "0.0.1", "planHash": "a" * 64,
            "files": [f"plugins/{plugin_id}/adapters/presentation.tsx"], "instances": ["composer-main"]}
    client = AsyncMock()
    client.plan_plugin_source_takeover.return_value = plan
    client.takeover_plugin_source.return_value = {"pluginId": plugin_id, "ownership": "project_source", "changedPaths": []}
    tools = create_operator_tools(client)
    selected = next(tool for tool in tools if tool.name == "takeover_plugin_source")

    async def node(state):
        return {"result": await selected.ainvoke({"pluginId": plugin_id, "locale": locale})}

    graph = StateGraph(State)
    graph.add_node("takeover", node)
    graph.add_edge(START, "takeover")
    graph.add_edge("takeover", END)
    return graph.compile(checkpointer=InMemorySaver()), client, selected, tools


@pytest.mark.asyncio
@pytest.mark.parametrize("locale", ["en-US", "zh-CN"])
@pytest.mark.parametrize("decision", ["approve", "decline"])
async def test_real_graph_interrupt_before_apply_and_trusted_resume(locale, decision):
    graph, client, tool, _ = setup(locale)
    config = {"configurable": {"thread_id": "takeover-test"}}
    paused = await graph.ainvoke({}, config)
    client.takeover_plugin_source.assert_not_awaited()
    question = paused["__interrupt__"][0].value
    assert question["kind"] == "ask_user_question"
    step = question["steps"][0]
    assert step["id"] == "plugin-source-" + "a" * 64
    assert step["description"] == MESSAGES[locale]["description"]
    assert "npm" in step["description"]
    for internal_detail in ["planHash", "1.2.3", "composer-main", "plugins/composer", "{", "}"]:
        assert internal_detail not in step["description"]
    assert "approved" not in tool.args and "planHash" not in tool.args
    resumed = await graph.ainvoke(Command(resume={"answers": {step["id"]: [decision]}}), config)
    if decision == "approve":
        client.takeover_plugin_source.assert_awaited_once_with("composer", "a" * 64)
        assert "project_source" in resumed["result"]
    else:
        client.takeover_plugin_source.assert_not_awaited()
        assert "declined" in resumed["result"]


@pytest.mark.asyncio
async def test_graph_replay_rejects_confirmation_when_package_or_project_changed():
    graph, client, _, _ = setup()
    config = {"configurable": {"thread_id": "stale-test"}}
    paused = await graph.ainvoke({}, config)
    step = paused["__interrupt__"][0].value["steps"][0]["id"]
    new_plan = copy.deepcopy(client.plan_plugin_source_takeover.return_value)
    new_plan["planHash"] = "b" * 64
    client.plan_plugin_source_takeover.return_value = new_plan
    with pytest.raises(ValueError, match="every question step"):
        await graph.ainvoke(Command(resume={"answers": {step: ["approve"]}}), config)
    client.takeover_plugin_source.assert_not_awaited()


@pytest.mark.asyncio
async def test_invalid_or_fabricated_answer_never_applies():
    graph, client, _, _ = setup()
    config = {"configurable": {"thread_id": "invalid-test"}}
    paused = await graph.ainvoke({}, config)
    step = paused["__interrupt__"][0].value["steps"][0]["id"]
    with pytest.raises(ValueError):
        await graph.ainvoke(Command(resume={"answers": {step: ["yes"]}}), config)
    client.takeover_plugin_source.assert_not_awaited()


def test_locales_have_parity_and_takeover_is_not_available_in_read_only_mode():
    _, _, _, tools = setup()
    assert MESSAGES["en-US"].keys() == MESSAGES["zh-CN"].keys()
    assert "takeover_plugin_source" not in {tool.name for tool in filter_domain_read_tools(tools)}
    assert "takeover_plugin_source" in {tool.name for tool in filter_domain_write_tools(tools)}


@pytest.mark.parametrize("intent", ["none", "conditional", "explicit", "needs_decision"])
def test_adapters_writable_after_takeover_but_metadata_and_upstream_stay_protected(tmp_path, intent):
    from types import SimpleNamespace
    from agent_ui_creator.plugin_development.admission_middleware import PluginDevelopmentAdmissionMiddleware
    from agent_ui_creator.plugin_development.authority import PluginDevelopmentError
    from agent_ui_creator.minimal_agent.path_policy import MinimalAgentPathPolicy, PathPolicyViolation
    metadata = tmp_path / ".agent-ui"
    metadata.mkdir()
    (metadata / "project.json").write_text(json.dumps({"mode": "assistant", "sourceRoot": "src/ui"}))
    (tmp_path / "src/ui/plugins/composer/adapters").mkdir(parents=True)
    authority = SimpleNamespace(project_root=tmp_path, active=None, intent=intent, user_message="修改 composer")
    middleware = PluginDevelopmentAdmissionMiddleware(authority)
    with pytest.raises(PluginDevelopmentError, match="takeover_plugin_source"):
        middleware._admit("edit_file", {"file_path": "/src/ui/plugins/composer/adapters/composer.tsx"})
    (metadata / "plugin-ownership.json").write_text(json.dumps({"schemaVersion": 1, "plugins": {
        "composer": {"pluginId": "composer", "directory": "composer", "base": {"index.tsx": {"sha256": "abc"}}}}}))
    middleware._admit("edit_file", {"file_path": "/src/ui/plugins/composer/adapters/composer.tsx"})
    middleware._admit("mutate_ui_plugin_source", {"pluginId": "composer"})
    policy = MinimalAgentPathPolicy(source_root="src/ui")
    assert policy.assert_write("/src/ui/plugins/composer/adapters/composer.tsx")
    for path in ["/.agent-ui/plugin-ownership.json", "/src/ui/plugins/composer/upstream/thread.tsx"]:
        with pytest.raises(PathPolicyViolation):
            policy.assert_write(path)


@pytest.mark.asyncio
async def test_actual_deepagent_runner_resumes_the_same_takeover_call():
    from deepagents import create_deep_agent
    from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
    from langchain_core.messages import AIMessage
    from agent_ui_creator.streaming import CreatorEventBus, DeepAgentV3Runner, ToolInvocationFinished
    from agent_ui_creator.streaming.deepagent_v3_runner import DeepAgentInterrupted, DeepAgentCompleted

    class Model(FakeMessagesListChatModel):
        def bind_tools(self, tools, **kwargs):
            return self

    _, client, selected, _ = setup()
    graph = create_deep_agent(model=Model(responses=[
        AIMessage(content="", tool_calls=[{"name": "takeover_plugin_source", "args": {"pluginId": "composer"}, "id": "takeover-1"}]),
        AIMessage(content="Done"),
    ]), tools=[selected], checkpointer=InMemorySaver(), subagents=[])
    config = {"configurable": {"thread_id": "actual-runner"}}
    runner, bus = DeepAgentV3Runner(), CreatorEventBus()
    paused = await runner.run_result(graph=graph, input={"messages": [{"role": "user", "content": "Customize composer"}]}, config=config, event_sink=bus)
    assert isinstance(paused, DeepAgentInterrupted)
    client.takeover_plugin_source.assert_not_awaited()
    bus.close()
    events = [event async for event in bus.events()]
    assert not any(isinstance(event, ToolInvocationFinished) for event in events)
    step = paused.interrupts[0]["value"]["steps"][0]["id"]
    resumed_bus = CreatorEventBus()
    completed = await runner.run_result(graph=graph, input=Command(resume={"answers": {step: ["approve"]}}), config=config, event_sink=resumed_bus)
    assert isinstance(completed, DeepAgentCompleted)
    resumed_bus.close()
    finished = [event async for event in resumed_bus.events() if isinstance(event, ToolInvocationFinished)]
    assert len(finished) == 1 and finished[0].call_id == "takeover-1" and finished[0].status == "success"
    client.takeover_plugin_source.assert_awaited_once()


@pytest.mark.parametrize("intent", ["none", "conditional", "explicit", "needs_decision"])
def test_thin_application_edit_is_not_source_takeover(tmp_path, intent):
    from types import SimpleNamespace
    from agent_ui_creator.plugin_development.admission_middleware import PluginDevelopmentAdmissionMiddleware
    from agent_ui_creator.plugin_development.authority import PluginDevelopmentError
    metadata = tmp_path / ".agent-ui"
    metadata.mkdir()
    (metadata / "project.json").write_text(json.dumps({"mode": "assistant", "sourceRoot": "src/ui"}))
    directory = tmp_path / "src/ui/plugins/composer"
    directory.mkdir(parents=True)
    (directory / "application.json").write_text(json.dumps({"schemaVersion": 1, "pluginId": "composer"}))
    authority = SimpleNamespace(project_root=tmp_path, active=None, intent=intent, user_message="修改 composer")
    middleware = PluginDevelopmentAdmissionMiddleware(authority)
    middleware._admit("edit_file", {"file_path": "/src/ui/plugins/composer/index.tsx"})
    middleware._admit("mutate_ui_plugin_source", {"pluginId": "composer", "changes": [{"type": "edit", "relativePath": "index.tsx", "edits": []}]})
    assert not middleware._source_owned("composer")
    for relative in ["source/adapters/composer.tsx", "../index.tsx", "source/../index.tsx", "application.json"]:
        assert not middleware._application_edit_allowed("composer", relative)
    with pytest.raises(PluginDevelopmentError, match="takeover_plugin_source"):
        middleware._admit("edit_file", {"file_path": "/src/ui/plugins/composer/source/adapters/composer.tsx"})
    with pytest.raises(PluginDevelopmentError, match="takeover_plugin_source"):
        middleware._admit("mutate_ui_plugin_source", {"pluginId": "composer", "changes": [{"type": "create", "relativePath": "source/index.tsx", "content": ""}]})


@pytest.mark.parametrize("status", ["pending", "adjust", "defer", "authorized"])
def test_source_ownership_does_not_bypass_active_development_plan(tmp_path, status):
    from types import SimpleNamespace
    from agent_ui_creator.plugin_development.admission_middleware import PluginDevelopmentAdmissionMiddleware
    from agent_ui_creator.plugin_development.authority import PluginDevelopmentError
    metadata = tmp_path / ".agent-ui"
    metadata.mkdir()
    (metadata / "project.json").write_text(json.dumps({"mode": "assistant", "sourceRoot": "src/ui"}))
    (metadata / "plugin-ownership.json").write_text(json.dumps({"schemaVersion": 1, "plugins": {
        "composer": {"pluginId": "composer", "directory": "composer", "base": {"index.tsx": {"sha256": "abc"}}}}}))
    authority = SimpleNamespace(project_root=tmp_path, intent="conditional", user_message="修改 composer",
                                active=SimpleNamespace(status=status, target_plugin_id="other"),
                                require_skill=lambda: None)
    middleware = PluginDevelopmentAdmissionMiddleware(authority)
    for name, args in [("edit_file", {"file_path": "/src/ui/plugins/composer/source/adapters/composer.tsx"}),
                       ("mutate_ui_plugin_source", {"pluginId": "composer"})]:
        with pytest.raises(PluginDevelopmentError):
            middleware._admit(name, args)


def test_owned_plugin_does_not_authorize_another_new_identity(tmp_path):
    from agent_ui_creator.plugin_development.admission_middleware import PluginDevelopmentAdmissionMiddleware
    from agent_ui_creator.plugin_development.authority import PluginDevelopmentAuthority, PluginDevelopmentError
    metadata = tmp_path / ".agent-ui"
    metadata.mkdir()
    (metadata / "project.json").write_text(json.dumps({"mode": "assistant", "sourceRoot": "src/ui"}))
    (metadata / "plugin-ownership.json").write_text(json.dumps({"schemaVersion": 1, "plugins": {
        "composer": {"pluginId": "composer", "directory": "composer", "base": {"index.tsx": {"sha256": "abc"}}}}}))
    authority = PluginDevelopmentAuthority(tmp_path, thread_id="scope")
    authority.begin_task(task_id="edit", request_id="edit", user_message="修改 composer", intent="conditional")
    middleware = PluginDevelopmentAdmissionMiddleware(authority)
    for name, args in [("create_ui_plugin", {"pluginId": "another"}),
                       ("edit_file", {"file_path": "/src/ui/plugins/another/index.tsx"}),
                       ("mutate_ui_plugin_source", {"pluginId": "another"})]:
        with pytest.raises(PluginDevelopmentError):
            middleware._admit(name, args)


@pytest.mark.asyncio
@pytest.mark.parametrize("plugin_id", ["copy-action", "reload-action", "feedback-actions", "export-markdown-action", "reasoning", "tool-group", "add-attachment-action", "dictation-action", "submit-action", "response-footer", "conversation-suggestions", "thinking-indicator", "tool-timeline", "tool-fallback", "transient-assistant-messages", "agent-status-message", "agent-plan-message", "job-progress-message", "generated-file-message", "chart-message", "source-citations-message", "retrieval-chunks", "web-search", "conversation-thread-list", "conversation-new", "conversation-quote", "agent-identity", "auth-account", "auth-gate", "conversation-command-source", "conversation-data-source", "conversation-service", "conversation-surface", "lexical-composer-input", "lexical-edit-composer", "locale-provider", "mention-trigger", "response-footer", "slash-command-trigger", "task-group", "theme-provider", "theme-switch"])
@pytest.mark.parametrize("decision", ["approve", "decline"])
async def test_generic_official_plugins_use_the_same_trusted_consent(plugin_id, decision):
    graph, client, _, _ = setup(plugin_id=plugin_id)
    config = {"configurable": {"thread_id": "generic-" + plugin_id}}
    paused = await graph.ainvoke({}, config)
    client.takeover_plugin_source.assert_not_awaited()
    step = paused["__interrupt__"][0].value["steps"][0]
    assert plugin_id in step["title"] if "title" in step else plugin_id in step["question"]
    await graph.ainvoke(Command(resume={"answers": {step["id"]: [decision]}}), config)
    if decision == "approve":
        client.takeover_plugin_source.assert_awaited_once_with(plugin_id, "a" * 64)
    else:
        client.takeover_plugin_source.assert_not_awaited()


@pytest.mark.parametrize("plugin_id", ["copy-action", "reload-action", "feedback-actions", "export-markdown-action", "reasoning", "tool-group", "add-attachment-action", "dictation-action", "submit-action", "response-footer", "conversation-suggestions", "thinking-indicator", "tool-timeline", "tool-fallback", "transient-assistant-messages", "agent-status-message", "agent-plan-message", "job-progress-message", "generated-file-message", "chart-message", "source-citations-message", "retrieval-chunks", "web-search", "conversation-thread-list", "conversation-new", "conversation-quote", "agent-identity", "auth-account", "auth-gate", "conversation-command-source", "conversation-data-source", "conversation-service", "conversation-surface", "lexical-composer-input", "lexical-edit-composer", "locale-provider", "mention-trigger", "response-footer", "slash-command-trigger", "task-group", "theme-provider", "theme-switch"])
def test_installed_catalog_drives_generic_source_admission(tmp_path, plugin_id):
    from types import SimpleNamespace
    from agent_ui_creator.plugin_development.admission_middleware import PluginDevelopmentAdmissionMiddleware
    from agent_ui_creator.plugin_development.authority import PluginDevelopmentError
    metadata = tmp_path / ".agent-ui"
    metadata.mkdir()
    (metadata / "project.json").write_text(json.dumps({"mode": "assistant", "sourceRoot": "src/ui"}))
    package = tmp_path / "node_modules" / "@za38.03" / "agent-ui-plugins"
    (package / "dist").mkdir(parents=True)
    identity = {"name": "@za38.03/agent-ui-plugins", "version": "1.2.3"}
    (package / "package.json").write_text(json.dumps(identity))
    (package / "dist" / "catalog.json").write_text(json.dumps({"package": identity, "plugins": [{"id": plugin_id, "takeover": {"schemaVersion": 1}}]}))
    directory = tmp_path / "src/ui/plugins" / plugin_id
    directory.mkdir(parents=True)
    (directory / "application.json").write_text(json.dumps({"schemaVersion": 1, "pluginId": plugin_id}))
    authority = SimpleNamespace(project_root=tmp_path, active=None, intent="conditional", user_message="修改 " + plugin_id)
    middleware = PluginDevelopmentAdmissionMiddleware(authority)
    middleware._admit("edit_file", {"file_path": f"/src/ui/plugins/{plugin_id}/index.tsx"})
    with pytest.raises(PluginDevelopmentError, match="takeover_plugin_source"):
        middleware._admit("edit_file", {"file_path": f"/src/ui/plugins/{plugin_id}/source/adapters/presentation.tsx"})
    (metadata / "plugin-ownership.json").write_text(json.dumps({"schemaVersion": 1, "plugins": {
        plugin_id: {"pluginId": plugin_id, "directory": plugin_id, "base": {"source/index.tsx": {"sha256": "abc"}}}}}))
    middleware._admit("edit_file", {"file_path": f"/src/ui/plugins/{plugin_id}/source/adapters/presentation.tsx"})


def test_newly_packaged_plugin_preserves_editable_legacy_source_without_granting_takeover(tmp_path):
    from types import SimpleNamespace
    from agent_ui_creator.plugin_delivery import is_legacy_project_plugin
    from agent_ui_creator.plugin_development.admission_middleware import PluginDevelopmentAdmissionMiddleware
    from agent_ui_creator.plugin_development.authority import PluginDevelopmentError
    metadata = tmp_path / ".agent-ui"
    metadata.mkdir()
    (metadata / "project.json").write_text(json.dumps({"mode": "assistant", "sourceRoot": "src/ui"}))
    package = tmp_path / "node_modules/@za38.03/agent-ui-plugins"
    (package / "dist").mkdir(parents=True)
    identity = {"name": "@za38.03/agent-ui-plugins", "version": "1.2.3"}
    (package / "package.json").write_text(json.dumps(identity))
    catalog = {"package": identity, "plugins": [{"id": "copy-action", "takeover": {"schemaVersion": 1}, "application": {"preserveLegacySource": True}}]}
    (package / "dist/catalog.json").write_text(json.dumps(catalog))
    directory = tmp_path / "src/ui/plugins/copy-action"
    directory.mkdir(parents=True)
    (directory / "manifest.json").write_text(json.dumps({"id": "copy-action"}))
    (directory / "definition.ts").write_text("// existing user implementation")
    authority = SimpleNamespace(project_root=tmp_path, active=None, intent="conditional", user_message="修改复制按钮")
    middleware = PluginDevelopmentAdmissionMiddleware(authority)
    assert is_legacy_project_plugin(tmp_path, "copy-action")
    middleware._admit("edit_file", {"file_path": "/src/ui/plugins/copy-action/index.tsx"})
    assert not (metadata / "plugin-ownership.json").exists()
    (directory / "application.json").write_text(json.dumps({"schemaVersion": 1, "pluginId": "copy-action"}))
    assert not is_legacy_project_plugin(tmp_path, "copy-action")
    with pytest.raises(PluginDevelopmentError, match="takeover_plugin_source"):
        middleware._admit("edit_file", {"file_path": "/src/ui/plugins/copy-action/source/index.tsx"})
    (directory / "application.json").unlink()
    (package / "package.json").write_text(json.dumps({**identity, "version": "9.0.0"}))
    assert not is_legacy_project_plugin(tmp_path, "copy-action")
