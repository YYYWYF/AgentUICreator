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
    status = (
        "error"
        if isinstance(payload, dict) and payload.get("ok") is False
        else "success"
    )
    return ToolMessage(
        content=json.dumps(payload),
        tool_call_id=call_id,
        name="tool",
        status=status,
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
    assert guard.metrics.taskChangeLayers == []
    assert guard.metrics.attemptedChangeLayers == ["composition"]
    assert guard.metrics.attemptedResources == ["app-ui-model"]
    assert guard.metrics.crossLayerTransitionCount == 0
    assert guard.metrics.blockedCrossLayerRepairAttempts == 1


def test_workspace_integrity_blocks_same_layer_different_resource_repair():
    guard = ScopeAwareRecoveryGuard()
    first = request(
        "edit_file",
        {"file_path": "/plugins/foo/index.tsx"},
        "first-edit",
    )
    guard.wrap_tool_call(
        first,
        lambda _request: tool_result("first-edit", {"ok": True, "result": {}}),
    )
    blocker = request("validate_creator_changes", {}, "validation")
    guard.wrap_tool_call(
        blocker,
        lambda _request: tool_result(
            "validation",
            {
                "ok": True,
                "result": {
                    "failureSemantics": {
                        "category": "workspace_integrity",
                        "automaticRepairAllowed": False,
                    }
                },
            },
        ),
    )

    blocked = guard.wrap_tool_call(
        request(
            "edit_file",
            {"file_path": "/plugins/bar/manifest.json"},
            "bar-edit",
        ),
        lambda _request: (_ for _ in ()).throw(AssertionError("must not run")),
    )

    payload = json.loads(blocked.content)
    assert payload["error"]["code"] == "CROSS_RESOURCE_REPAIR_PROHIBITED"
    assert payload["error"]["recovery"]["automaticCrossResourceRepairAllowed"] is False
    assert guard.metrics.taskChangeLayers == ["plugin_behavior"]
    assert guard.metrics.scopeResources == ["plugin:foo"]
    assert guard.metrics.blockedCrossLayerRepairAttempts == 0
    assert guard.metrics.blockedCrossResourceRepairAttempts == 1


def test_composition_document_key_does_not_authorize_other_plugin_instance():
    guard = ScopeAwareRecoveryGuard()
    guard.wrap_tool_call(
        request(
            "mutate_app_ui_model",
            {
                "operations": [
                    {
                        "type": "set_plugin_enabled",
                        "instanceId": "foo-main",
                        "enabled": False,
                    }
                ]
            },
            "foo-mutation",
        ),
        lambda _request: tool_result(
            "foo-mutation",
            {
                "ok": False,
                "error": {
                    "code": "PLUGIN_CHILD_SLOT_CONTRACT_INVALID",
                    "category": "workspace_integrity",
                },
            },
        ),
    )

    blocked = guard.wrap_tool_call(
        request(
            "mutate_app_ui_model",
            {
                "operations": [
                    {
                        "type": "set_plugin_enabled",
                        "instanceId": "bar-main",
                        "enabled": False,
                    }
                ]
            },
            "bar-mutation",
        ),
        lambda _request: (_ for _ in ()).throw(AssertionError("must not run")),
    )

    assert json.loads(blocked.content)["error"]["code"] == (
        "CROSS_RESOURCE_REPAIR_PROHIBITED"
    )
    assert guard.metrics.blockedCrossResourceRepairAttempts == 1


def test_unknown_side_effect_path_fails_closed_after_blocker():
    guard = ScopeAwareRecoveryGuard()
    guard.wrap_tool_call(
        request(
            "edit_file",
            {"file_path": "/plugins/foo/index.tsx"},
            "foo-edit",
        ),
        lambda _request: tool_result("foo-edit", {"ok": True}),
    )
    guard.wrap_tool_call(
        request("validate_creator_changes", {}, "validation"),
        lambda _request: tool_result(
            "validation",
            {
                "ok": True,
                "result": {
                    "failureSemantics": {
                        "category": "workspace_integrity",
                        "automaticRepairAllowed": False,
                    }
                },
            },
        ),
    )

    blocked = guard.wrap_tool_call(
        request("edit_file", {"file_path": "/other/file.ts"}, "unknown-edit"),
        lambda _request: (_ for _ in ()).throw(AssertionError("must not run")),
    )

    assert json.loads(blocked.content)["error"]["code"] == (
        "CROSS_RESOURCE_REPAIR_PROHIBITED"
    )


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
