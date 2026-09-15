from __future__ import annotations

import json
from types import SimpleNamespace

from langchain_core.messages import ToolMessage

from agent_ui_creator.domain_agent.change_scope import ScopeAwareRecoveryGuard


def request(name, arguments, call_id):
    return SimpleNamespace(
        tool_call={"name": name, "args": arguments, "id": call_id}
    )


def tool_result(call_id, payload):
    return ToolMessage(
        content=json.dumps(payload), tool_call_id=call_id, name="tool"
    )


def test_workspace_integrity_blocks_cross_layer_plugin_repair():
    guard = ScopeAwareRecoveryGuard()
    mutation = request("mutate_app_ui_model", {"operations": []}, "mutation")
    mutation_result = tool_result(
        "mutation",
        {
            "ok": False,
            "error": {
                "code": "PLUGIN_CHILD_SLOT_CONTRACT_INVALID",
                "category": "workspace_integrity",
            },
        },
    )

    guard.wrap_tool_call(mutation, lambda _request: mutation_result)

    edit = request(
        "edit_file",
        {"file_path": "/plugins/conversation-surface/manifest.json"},
        "edit",
    )
    blocked = guard.wrap_tool_call(
        edit,
        lambda _request: (_ for _ in ()).throw(AssertionError("must not run")),
    )
    payload = json.loads(blocked.content)

    assert payload["error"]["code"] == "CROSS_LAYER_REPAIR_PROHIBITED"
    assert payload["error"]["recovery"]["automaticCrossLayerRepairAllowed"] is False
    assert guard.metrics.taskChangeLayers == ["composition"]
    assert guard.metrics.crossLayerTransitionCount == 0
    assert guard.metrics.blockedCrossLayerRepairAttempts == 1


def test_legitimate_multi_layer_request_records_transition_without_a_blocker():
    guard = ScopeAwareRecoveryGuard()
    guard.wrap_tool_call(
        request("mutate_app_ui_model", {"operations": []}, "composition"),
        lambda _request: tool_result("composition", {"ok": True, "result": {}}),
    )
    guard.wrap_tool_call(
        request(
            "edit_file",
            {"file_path": "/plugins/example/index.tsx"},
            "behavior",
        ),
        lambda _request: tool_result("behavior", "edited"),
    )

    assert guard.metrics.taskChangeLayers == ["composition", "plugin_behavior"]
    assert guard.metrics.crossLayerTransitionCount == 1


def test_skill_loading_is_recorded_from_skill_read():
    guard = ScopeAwareRecoveryGuard()
    guard.wrap_tool_call(
        request(
            "read_file",
            {"file_path": "/skills/app-ui-model/SKILL.md"},
            "skill",
        ),
        lambda _request: tool_result("skill", "skill content"),
    )

    assert guard.metrics.skillsLoaded == ["app-ui-model"]


def test_runtime_width_failure_preserves_composition_without_workspace_blocker():
    guard = ScopeAwareRecoveryGuard()
    guard.wrap_tool_call(
        request("mutate_app_ui_model", {"operations": []}, "composition"),
        lambda _request: tool_result("composition", {"ok": True, "result": {}}),
    )
    runtime = request("inspect_runtime_errors", {}, "runtime")
    runtime_result = tool_result(
        "runtime",
        {
            "ok": True,
            "result": {
                "runtimeStatus": "failed",
                "currentErrors": [{"kind": "plugin-width-incompatible"}],
                "compositionChecks": [],
            },
        },
    )

    guard.wrap_tool_call(runtime, lambda _request: runtime_result)
    guard.wrap_tool_call(
        request("mutate_app_ui_model", {"operations": []}, "retry"),
        lambda _request: tool_result("retry", {"ok": True, "result": {}}),
    )
    blocked = guard.wrap_tool_call(
        request(
            "edit_file",
            {"file_path": "/plugins/example/index.tsx"},
            "cross-layer",
        ),
        lambda _request: (_ for _ in ()).throw(AssertionError("must not run")),
    )

    assert json.loads(blocked.content)["error"]["code"] == (
        "CROSS_LAYER_REPAIR_PROHIBITED"
    )
    assert guard.metrics.workspaceIntegrityBlockers == 0
    assert guard.metrics.taskChangeLayers == ["composition"]
