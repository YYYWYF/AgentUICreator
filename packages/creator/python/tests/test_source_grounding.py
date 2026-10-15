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
    control = next_request.messages[-1].content
    assert "Once the files and dependencies actually required" in control
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
