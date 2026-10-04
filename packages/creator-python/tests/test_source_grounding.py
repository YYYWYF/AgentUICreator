from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

from langchain_core.messages import ToolMessage

from agent_ui_creator.domain_agent.source_grounding import (
    SourceGroundingConvergenceMiddleware,
    create_edit_file_from_read_tool,
)
from agent_ui_creator.minimal_agent.path_policy import (
    MinimalAgentPathPolicy,
    PolicyFilesystemBackend,
)
from agent_ui_creator.model_protocol.trace import ToolProtocolMetrics
from agent_ui_creator.operations.models import CreatorAuthoringHandoff


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
