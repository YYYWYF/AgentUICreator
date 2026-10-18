from __future__ import annotations

import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

from langchain_core.messages import ToolMessage

from agent_ui_creator.domain_agent.source_grounding import (
    SourceGroundingConvergenceMiddleware,
    create_edit_file_from_read_tool,
)
from agent_ui_creator.domain_agent.change_scope import ScopeAwareRecoveryGuard
from agent_ui_creator.minimal_agent.path_policy import (
    MinimalAgentPathPolicy,
    PolicyFilesystemBackend,
)
from agent_ui_creator.model_protocol.trace import ToolProtocolMetrics
from agent_ui_creator.operations.models import CreatorAuthoringHandoff
from agent_ui_creator.validation import CommandExecutionResult, CreatorValidationService


def _grounding(tmp_path: Path):
    (tmp_path / ".agent-ui").mkdir()
    (tmp_path / ".agent-ui" / "project.json").write_text(
        json.dumps({"mode": "assistant", "sourceRoot": "src"}), encoding="utf-8",
    )
    path = tmp_path / "src" / "plugins" / "conversation-thread-list" / "index.ts"
    path.parent.mkdir(parents=True)
    path.write_text("first\n  test agent\nlast\n", encoding="utf-8")
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.development())
    handoff = CreatorAuthoringHandoff(
        targetId="plugin:conversation-thread-list", kind="plugin_source",
        name="Conversation Thread List", description="Thread list source",
        ownerRoot="src/plugins/conversation-thread-list",
        definitionPath="src/plugins/conversation-thread-list/index.ts",
        pluginId="conversation-thread-list",
    )
    grounding = SourceGroundingConvergenceMiddleware(backend, handoff, ToolProtocolMetrics())
    virtual = "/src/plugins/conversation-thread-list/index.ts"
    return backend, grounding, path, virtual


def _read(backend, grounding, virtual):
    assert backend.read(virtual).error is None
    grounding._after(
        SimpleNamespace(tool_call={"name": "read_file", "args": {"file_path": virtual}}),
        ToolMessage(content="read", tool_call_id="read-1", status="success"),
    )


def test_range_edit_uses_fresh_read_and_rejects_external_change(tmp_path):
    backend, grounding, path, virtual = _grounding(tmp_path)
    edit = create_edit_file_from_read_tool(backend, grounding)
    _read(backend, grounding, virtual)
    path.write_text("first\n  external change\nlast\n", encoding="utf-8")

    stale = json.loads(edit.invoke({
        "file_path": virtual, "mode": "replace_lines", "start_line": 2,
        "replacement": "  my agent",
    }))
    assert stale["error"]["code"] == "FILE_CHANGED_SINCE_READ"
    assert "external change" in path.read_text(encoding="utf-8")

    _read(backend, grounding, virtual)
    result = json.loads(edit.invoke({
        "file_path": virtual, "mode": "replace_lines", "start_line": 2,
        "replacement": "  my agent",
    }))
    assert result["ok"] is True
    assert path.read_text(encoding="utf-8") == "first\n  my agent\nlast\n"


def test_cross_layer_tool_exits_source_lane_after_normal_execution(tmp_path):
    _backend, grounding, _path, _virtual = _grounding(tmp_path)
    request = SimpleNamespace(tool_call={"name": "inspect_ui_services", "args": {}})
    calls = []
    result = grounding.wrap_tool_call(request, lambda _request: calls.append("executed") or
                                      ToolMessage(content="{}", tool_call_id="inspect-1", status="success"))
    assert result.status == "success"
    assert calls == ["executed"]
    assert grounding.metrics.sourceFastPathExited is True
    assert grounding.metrics.sourceFastPathExitTool == "inspect_ui_services"


def test_source_owner_lane_exposes_native_takeover_then_expands(tmp_path):
    _backend, grounding, _path, _virtual = _grounding(tmp_path)
    tools = [SimpleNamespace(name=name) for name in (
        "read_file", "takeover_plugin_source", "create_ui_plugin",
    )]
    request = SimpleNamespace(messages=[], tools=tools,
                              override=lambda **kwargs: SimpleNamespace(**kwargs))
    assert [item.name for item in grounding._request(request).tools] == ["read_file", "takeover_plugin_source"]
    grounding.wrap_tool_call(
        SimpleNamespace(tool_call={"name": "takeover_plugin_source", "args": {"pluginId": "composer"}}),
        lambda _: ToolMessage(content='{"ownership":"project_source"}', tool_call_id="takeover", status="success"),
    )
    assert grounding.metrics.sourceFastPathExited is True
    assert grounding.metrics.sourceFastPathExitTool == "takeover_plugin_source"
    assert "authoringTarget" in grounding._request(request).messages[-1].content


def test_source_owner_lane_keeps_runtime_verification_available(tmp_path):
    _backend, grounding, _path, _virtual = _grounding(tmp_path)
    tool = SimpleNamespace(name="inspect_runtime_errors")
    request = SimpleNamespace(messages=[], tools=[tool], override=lambda **kwargs: SimpleNamespace(**kwargs))
    assert grounding._request(request).tools == [tool]
    grounding.wrap_tool_call(
        SimpleNamespace(tool_call={"name": "inspect_runtime_errors", "args": {}}),
        lambda _: ToolMessage(content='{"runtimeStatus":"passed"}', tool_call_id="runtime", status="success"),
    )
    assert grounding.metrics.sourceFastPathExited is True
    assert "authoringTarget" in grounding._request(request).messages[-1].content


def test_missing_handoff_file_leaves_search_and_expansion_available(tmp_path):
    backend, grounding, path, virtual = _grounding(tmp_path)
    path.unlink()
    assert backend.read(virtual).error is not None
    assert virtual not in grounding.reads
    assert grounding.metrics.sourceFastPathActivated is True
    assert grounding.metrics.sourceFastPathExited is False
    assert backend.ls("/src/plugins/conversation-thread-list").error is None


def test_first_source_read_does_not_claim_grounding_is_sufficient(tmp_path):
    backend, grounding, _path, virtual = _grounding(tmp_path)
    _read(backend, grounding, virtual)
    tools = [SimpleNamespace(name=name) for name in (
        "read_file", "grep", "inspect_ui_services", "edit_file_from_read",
    )]
    request = SimpleNamespace(
        messages=[], tools=tools,
        override=lambda **kwargs: SimpleNamespace(**kwargs),
    )

    next_request = grounding._request(request)

    assert [item.name for item in next_request.tools] == [item.name for item in tools]
    control = " ".join(next_request.messages[-1].content.split())
    assert "not read evidence, consent or mutation authority" in control
    assert "Fresh source evidence is available" not in control
    assert "Prefer the mutation now" not in control


def test_range_edit_uses_host_baseline_scope_transaction_and_current_validation(tmp_path):
    backend, grounding, path, virtual = _grounding(tmp_path)
    _read(backend, grounding, virtual)

    class Runner:
        def __init__(self):
            self.calls = []

        async def execute_known_command(self, command):
            self.calls.append((command, backend.activity.revision))
            return CommandExecutionResult("", 0, False)

    runner = Runner()
    scope = ScopeAwareRecoveryGuard(project_root=str(tmp_path))
    validation = CreatorValidationService(
        project_root=tmp_path, activity=backend.activity,
        runner=runner, scope=scope.metrics,
    )
    scope.set_baseline_capture(validation.ensure_baseline)
    edit = create_edit_file_from_read_tool(backend, grounding)
    arguments = {
        "file_path": virtual, "mode": "replace_lines", "start_line": 2,
        "replacement": "  my agent",
    }
    request = SimpleNamespace(tool_call={
        "id": "edit-1", "name": "edit_file_from_read", "args": arguments,
    })

    async def scenario():
        async def perform(_request):
            return ToolMessage(
                content=edit.invoke(arguments), tool_call_id="edit-1", status="success",
            )

        mutation = await scope.awrap_tool_call(request, perform)
        revision_after_mutation = backend.activity.revision
        current = await validation.validate()
        receipt = backend.activity.finish()
        return mutation, revision_after_mutation, current, receipt

    mutation, revision, current, receipt = asyncio.run(scenario())
    assert json.loads(mutation.content)["ok"] is True
    assert runner.calls[0] == ("pnpm typecheck", 0)
    assert validation.has_pre_mutation_baseline is True
    assert revision == 1
    assert path.read_text(encoding="utf-8") == "first\n  my agent\nlast\n"
    assert receipt["files"][0]["path"] == "src/plugins/conversation-thread-list/index.ts"
    assert receipt["transaction"]["undoable"] is True
    assert scope.metrics.task_scope.to_dict() == {
        "layers": ["plugin_behavior"],
        "resources": ["plugin:conversation-thread-list"],
    }
    assert current.evidence.revision == 1
    assert current.status == "passed"
    assert ("pnpm verify:ui", 1) in runner.calls
    assert ("pnpm typecheck", 1) in runner.calls


def test_diagnostic_read_select_edit_remains_in_source_lane(tmp_path):
    from agent_ui_creator.debugging import DebuggingEvidence
    from agent_ui_creator.validation.diagnostics import parse_typescript_diagnostics
    from agent_ui_creator.domain_tools.debugging_tools import create_debugging_target_tools

    backend, grounding, path, virtual = _grounding(tmp_path)
    relative = virtual.lstrip('/')
    diagnostic = parse_typescript_diagnostics(f'{relative}(2,1): error TS2345: Wrong argument', exit_code=1).diagnostics[0]
    debugging = DebuggingEvidence()
    debugging.ensure_run(backend.activity.run_id)
    debugging.observe_static_targets([diagnostic], backend.activity.revision)
    _read(backend, grounding, virtual)
    current = SimpleNamespace(status='passed', revision=backend.activity.revision,
                              differential=SimpleNamespace(current_available=True, current_diagnostics=[diagnostic]))
    validation = SimpleNamespace(debugging=debugging, _synchronize_run_state=lambda: None,
                                 current_result=lambda: current)
    select, select_all = create_debugging_target_tools(validation, SimpleNamespace(current_result=lambda: None))
    tools = [select, select_all, SimpleNamespace(name='ask_user_question'),
             create_edit_file_from_read_tool(backend, grounding)]
    request = SimpleNamespace(messages=[], tools=tools, override=lambda **kwargs: SimpleNamespace(**kwargs))
    offered = grounding._request(request)
    assert {tool.name for tool in offered.tools} >= {'select_debugging_target', 'ask_user_question'}
    assert json.loads(asyncio.run(select.ainvoke({'target_id': 'ts:' + debugging.static_key(diagnostic)})))['ok']
    guard = ScopeAwareRecoveryGuard(project_root=str(tmp_path))
    guard.debugging = debugging
    args = {'file_path': virtual, 'mode': 'replace_lines', 'start_line': 2, 'replacement': 'fixed'}
    assert guard._debugging_selection_guard({'args': args}, 'edit_file_from_read') is None
    assert json.loads(tools[-1].invoke(args))['ok']
    assert not grounding.metrics.sourceFastPathExited
    assert 'fixed' in path.read_text()


def test_application_config_uses_source_guidance_without_forcing_mutation(tmp_path):
    backend, _grounding_instance, _path, _virtual = _grounding(tmp_path)
    handoff = CreatorAuthoringHandoff(
        targetId="theme.brand-palette", kind="application_config",
        name="Palette", description="Project styles",
        ownerPath="src/agent-ui/conversation/styles.css",
    )
    grounding = SourceGroundingConvergenceMiddleware(backend, handoff, ToolProtocolMetrics())
    tools = [SimpleNamespace(name=name) for name in (
        "read_file", "grep", "glob", "ask_user_question", "edit_file",
        "edit_file_from_read", "inspect_ui_services", "create_ui_plugin",
    )]
    request = SimpleNamespace(messages=[], tools=tools,
                              override=lambda **kwargs: SimpleNamespace(**kwargs))
    offered = grounding._request(request)
    assert grounding.metrics.sourceFastPathActivated
    assert {tool.name for tool in offered.tools} == {tool.name for tool in tools} - {
        "create_ui_plugin", "edit_file", "edit_file_from_read"}
    assert "Host has resolved this authoring owner" in offered.messages[-1].content
    assert "targeted installed public contracts" in offered.messages[-1].content
    grounding.wrap_tool_call(
        SimpleNamespace(tool_call={"name": "inspect_ui_services", "args": {}}),
        lambda _: ToolMessage(content="{}", tool_call_id="cross-layer", status="success"),
    )
    assert "authoringTarget" in grounding._request(request).messages[-1].content


def test_unresolved_target_keeps_general_agent_surface(tmp_path):
    backend, _, _, _ = _grounding(tmp_path)
    grounding = SourceGroundingConvergenceMiddleware(backend, None, ToolProtocolMetrics())
    request = SimpleNamespace(messages=[], tools=[SimpleNamespace(name="create_ui_plugin")])
    assert grounding._request(request) is request
    assert not grounding.metrics.sourceFastPathActivated


def test_same_owner_api_inspection_keeps_lane_but_another_owner_expands(tmp_path):
    _backend, grounding, _path, _virtual = _grounding(tmp_path)
    own = SimpleNamespace(tool_call={"name": "inspect_ui_plugin", "args": {"pluginId": "conversation-thread-list"}})
    grounding.wrap_tool_call(own, lambda _: ToolMessage(content='{"ok":true}', tool_call_id="own", status="success"))
    assert not grounding.metrics.sourceFastPathExited
    grounding._failed(own)
    assert not grounding.metrics.sourceFastPathExited
    other = SimpleNamespace(tool_call={"name": "inspect_ui_plugin", "args": {"pluginId": "conversation-history"}})
    grounding.wrap_tool_call(other, lambda _: ToolMessage(content='{"ok":true}', tool_call_id="other", status="success"))
    assert grounding.metrics.sourceFastPathExited
    assert grounding.metrics.sourceFastPathExitTool == "inspect_ui_plugin"


def test_general_inspection_keeps_owner_context_without_scope_or_consent(tmp_path):
    backend, _, _, _ = _grounding(tmp_path)
    grounding = SourceGroundingConvergenceMiddleware(backend, None, ToolProtocolMetrics())
    tools = [SimpleNamespace(name=name) for name in ("read_file", "takeover_plugin_source", "inspect_ui_services")]
    request = SimpleNamespace(messages=[], tools=tools, override=lambda **kwargs: SimpleNamespace(tools=tools, **kwargs))
    assert grounding._request(request) is request
    payload = {"ok": True, "result": {"asset": {"pluginId": "composer"}, "application": {
        "entryPath": "src/plugins/composer/index.tsx", "implementationOwnership": "npm",
        "publicApi": {"status": "available"},
    }}}
    call = SimpleNamespace(tool_call={"name": "inspect_ui_plugin", "args": {"pluginId": "composer"}})
    grounding._after(call, ToolMessage(content=json.dumps(payload), tool_call_id="api", status="success"))
    contextual = grounding._request(request)
    assert contextual.tools is tools
    assert "src/plugins/composer/index.tsx" in contextual.messages[-1].content
    assert "not fresh read evidence or write authority" in contextual.messages[-1].content
    assert grounding.handoff is None
    assert grounding.metrics.sourceFastPathActivated is False
    # Error/mismatched results must not promote an unverified owner.
    payload["result"]["asset"]["pluginId"] = "other"
    grounding._after(call, ToolMessage(content=json.dumps(payload), tool_call_id="bad", status="success"))
    assert list(grounding.inspected_owners) == ["composer"]
    grounding._after(call, ToolMessage(content='{"ok":false}', tool_call_id="err", status="success"))
    assert list(grounding.inspected_owners) == ["composer"]


def test_scoped_owner_context_survives_cross_layer_expansion(tmp_path):
    _, grounding, _, _ = _grounding(tmp_path)
    payload = {"ok": True, "result": {"asset": {"pluginId": "conversation-thread-list"},
        "application": {"entryPath": "src/plugins/conversation-thread-list/index.ts",
                        "implementationOwnership": "npm", "publicApi": {"status": "unavailable"}}}}
    grounding._after(SimpleNamespace(tool_call={"name": "inspect_ui_plugin", "args": {
        "pluginId": "conversation-thread-list"}}),
        ToolMessage(content=json.dumps(payload), tool_call_id="api", status="success"))
    assert grounding.metrics.sourceFastPathExited is False
    grounding._after(SimpleNamespace(tool_call={"name": "inspect_ui_services", "args": {}}),
                     ToolMessage(content='{}', tool_call_id="services", status="success"))
    request = SimpleNamespace(messages=[], tools=[], override=lambda **kwargs: SimpleNamespace(**kwargs))
    assert "unavailable" in grounding._request(request).messages[-1].content


def test_checkpoint_navigation_preserves_expansion_but_not_read_or_write_authority(tmp_path):
    backend, before, _, virtual = _grounding(tmp_path)
    _read(backend, before, virtual)
    before.metrics.sourceFastPathExited = True
    before.metrics.sourceFastPathExitTool = "inspect_ui_services"
    before.metrics.sourceFastPathExitReason = "cross_layer_dependency"
    state = before.export_navigation()
    after = SourceGroundingConvergenceMiddleware(backend, before.handoff, ToolProtocolMetrics())
    after.restore_navigation(state)
    assert after.metrics.sourceFastPathExited is True
    assert after.reads == {}
    assert after.first_write is False
    tools = [SimpleNamespace(name="create_custom_plugin")]
    request = SimpleNamespace(messages=[], tools=tools, override=lambda **kwargs: SimpleNamespace(tools=tools, **kwargs))
    result = after._request(request)
    assert result.tools is tools
    assert "conversation-thread-list" in result.messages[-1].content
    assert "not fresh read evidence or write authority" in result.messages[-1].content


def test_general_takeover_keeps_navigation_but_invalidates_old_contract(tmp_path):
    backend, _, _, _ = _grounding(tmp_path)
    grounding = SourceGroundingConvergenceMiddleware(backend, None, ToolProtocolMetrics())
    grounding.inspected_owners["sample"] = {"pluginId":"sample", "entryPath":"src/plugins/sample/index.tsx", "implementationOwnership":"npm", "apiStatus":"available"}
    grounding._after(SimpleNamespace(tool_call={"name":"takeover_plugin_source","args":{"pluginId":"sample"}}),
        ToolMessage(content='{"ok":true}',tool_call_id="takeover",status="success"))
    restored = SourceGroundingConvergenceMiddleware(backend, None, ToolProtocolMetrics())
    restored.restore_navigation(grounding.export_navigation())
    assert restored.inspected_owners["sample"]["apiStatus"] == "refresh-required"
    assert restored.reads == {}
    assert restored.handoff is None


def test_owner_file_navigation_is_real_bounded_and_does_not_grant_fresh_reads(tmp_path):
    backend, grounding, path, virtual = _grounding(tmp_path)
    (path.parent / "styles.css").write_text(".owned {}")
    files = grounding._owner_files()
    assert virtual in files
    assert virtual.rsplit("/", 1)[0] + "/styles.css" in files
    assert not any("render.tsx" in item for item in files)
    assert grounding.reads == {}
    assert backend.activity.file_observations.get(virtual) is None
    assert backend.activity.file_observations.get(virtual.rsplit("/", 1)[0] + "/styles.css") is None


def test_unread_owner_does_not_offer_text_edits_but_read_restores_them(tmp_path):
    backend, grounding, path, virtual = _grounding(tmp_path)
    tools = [SimpleNamespace(name=name) for name in (
        "read_file", "grep", "edit_file", "edit_file_from_read", "mutate_ui_plugin_source")]
    request = SimpleNamespace(messages=[], tools=tools,
        override=lambda **kwargs: SimpleNamespace(**kwargs))
    initial = grounding._request(request)
    assert {t.name for t in initial.tools} == {"read_file", "grep", "mutate_ui_plugin_source"}
    assert "registrationPath" in initial.messages[-1].content
    assert backend.activity.file_observations.get(virtual) is None
    _read(backend, grounding, virtual)
    assert {t.name for t in grounding._request(request).tools} == {t.name for t in tools}
    path.write_text("external change\n")
    assert backend.edit(virtual, "external", "replacement").error is not None
    # Navigation restore never restores a prior run's fresh reads.
    other = SourceGroundingConvergenceMiddleware(backend, grounding.handoff, ToolProtocolMetrics())
    other.restore_navigation(grounding.export_navigation())
    assert "edit_file" not in {t.name for t in other._request(request).tools}


def test_custom_plugin_public_query_index_is_current_run_only(tmp_path):
    _backend, grounding, _path, _virtual = _grounding(tmp_path)
    payload = {"ok":True,"result":{"sharedTypes":{
        "module":"public-package", "packageVersion":"1.2.3",
        "symbols":[{"name":"Panel", "status":"available", "presentationContract":{"styles":"packaged"}},
                   {"name":"Unknown", "status":"unavailable"}]}}}
    grounding._observe_plugin_contract({"pluginId":"conversation-thread-list"}, json.dumps(payload))
    assert list(grounding.contract_queries.values()) == [{
        "module":"public-package", "symbol":"Panel", "packageVersion":"1.2.3",
        "presentationAvailable":True}]
    assert "resolvedPublicQueries" not in grounding.export_navigation()
