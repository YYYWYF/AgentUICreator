import json
from types import SimpleNamespace

import pytest
from langchain_core.messages import ToolMessage

from agent_ui_creator.domain_agent.change_scope import (
    ScopeAwareRecoveryGuard,
    resource_keys_for_path,
    resource_keys_for_tool_call,
)
from agent_ui_creator.resource_scope import (
    contains_identifier,
    resource_keys_for_evidence,
)


def _request(name, arguments, call_id):
    return SimpleNamespace(
        tool_call={"name": name, "args": arguments, "id": call_id}
    )


def _tool_result(call_id, payload, *, status=None):
    if status is None:
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


@pytest.mark.parametrize(
    ("tool_name", "arguments", "expected"),
    [
        (
            "mutate_app_ui_model",
            {
                "operations": [
                    {"type": "remove_plugin", "instanceId": "history-main"}
                ]
            },
            ("app-ui-model", "plugin-instance:history-main"),
        ),
        (
            "mutate_app_ui_model",
            {
                "operations": [
                    {
                        "type": "insert_plugin",
                        "plugin": {
                            "id": "surface-main",
                            "pluginId": "conversation-surface",
                            "enabled": True,
                        },
                        "target": {
                            "type": "plugin_slot",
                            "parentInstanceId": "conversation-root-main",
                            "slot": "children",
                        },
                    }
                ]
            },
            (
                "app-ui-model",
                "plugin-instance:surface-main",
                "plugin:conversation-surface",
                "plugin-instance:conversation-root-main",
            ),
        ),
        (
            "mutate_app_ui_model",
            {
                "operations": [
                    {
                        "type": "replace_plugin",
                        "instanceId": "old-main",
                        "replacement": {
                            "id": "new-main",
                            "pluginId": "new-plugin",
                            "enabled": True,
                        },
                    }
                ]
            },
            (
                "app-ui-model",
                "plugin-instance:old-main",
                "plugin-instance:new-main",
                "plugin:new-plugin",
            ),
        ),
        (
            "mutate_app_ui_model",
            {
                "operations": [
                    {"type": "move_plugin", "instanceId": "foo-main", "target": {"type": "application"}},
                    {"type": "set_plugin_enabled", "instanceId": "bar-main", "enabled": False},
                    {"type": "set_plugin_enabled", "instanceId": "baz-main", "enabled": False},
                ]
            },
            (
                "app-ui-model",
                "plugin-instance:foo-main",
                "plugin-instance:bar-main",
                "plugin-instance:baz-main",
            ),
        ),
        (
            "mutate_ui_plugin_source",
            {"pluginId": "conversation-surface"},
            ("plugin:conversation-surface",),
        ),
        (
            "create_ui_plugin",
            {"pluginId": "new-plugin"},
            ("plugin:new-plugin",),
        ),
        (
            "edit_file",
            {"file_path": "/plugins/foo/manifest.json"},
            ("plugin:foo",),
        ),
        (
            "edit_file",
            {"file_path": "/services/ConversationService.ts"},
            ("service:ConversationService",),
        ),
        (
            "edit_file",
            {"file_path": "/agent-contract/runtime-events.ts"},
            ("agent-contract:runtime-events",),
        ),
        (
            "apply_agent_ui_source_item",
            {"itemId": "assistant-ui"},
            ("source-item:assistant-ui",),
        ),
    ],
)
def test_resource_keys_for_authorized_side_effects(tool_name, arguments, expected):
    assert resource_keys_for_tool_call(tool_name, arguments) == expected


def test_service_path_can_use_host_known_service_name():
    assert resource_keys_for_path(
        "/services/conversations.ts", service_name="ConversationService"
    ) == ("service:ConversationService",)


@pytest.mark.parametrize(
    ("identifier", "evidence"),
    [
        ("conversation-surface", "(conversation-surface) failed"),
        ("ConversationService", "[ConversationService]: invalid"),
        ("runtime-events", "error: runtime-events, malformed"),
        ("foo/bar", "resource 'foo/bar' is invalid"),
    ],
)
def test_contains_identifier_accepts_independent_semantic_identifiers(
    identifier, evidence
):
    assert contains_identifier(evidence, identifier) is True


@pytest.mark.parametrize(
    ("identifier", "evidence"),
    [
        ("conversation-surface", "other-conversation-surface"),
        ("ConversationService", "ConversationServiceV2"),
        ("runtime-events", "runtime-events/generated"),
        ("foo/bar", "prefix/foo/bar"),
    ],
)
def test_contains_identifier_rejects_identifier_substrings(identifier, evidence):
    assert contains_identifier(evidence, identifier) is False


def test_known_resource_evidence_matching_uses_identifier_boundaries():
    known = (
        "plugin:conversation-surface",
        "service:ConversationService",
        "agent-contract:runtime-events",
    )

    assert resource_keys_for_evidence(
        "(conversation-surface), [ConversationService], runtime-events!",
        known_resources=known,
    ) == known
    assert resource_keys_for_evidence(
        "conversation-surface-v2 ConversationServiceV2 runtime-events/generated",
        known_resources=known,
    ) == ()


def test_service_authorization_resolves_resource_without_persisting_auth_id():
    guard = ScopeAwareRecoveryGuard(
        service_resource_resolver=lambda _name, arguments: (
            ("service:ConversationService",)
            if arguments.get("authorizationId") == "host-issued"
            else ()
        )
    )
    request = SimpleNamespace(
        tool_call={
            "name": "create_ui_service_contract",
            "args": {"authorizationId": "host-issued", "content": "export {};"},
            "id": "create-service",
        }
    )

    guard.wrap_tool_call(
        request,
        lambda _request: ToolMessage(
            content='{"ok":true,"result":{"serviceName":"ConversationService"}}',
            tool_call_id="create-service",
            name="create_ui_service_contract",
        ),
    )

    assert guard.metrics.scopeResources == ["service:ConversationService"]
    assert "host-issued" not in guard.metrics.scopeResources


def test_failed_side_effect_does_not_expand_committed_scope():
    guard = ScopeAwareRecoveryGuard()
    guard.wrap_tool_call(
        _request(
            "edit_file",
            {"file_path": "/plugins/foo/index.tsx"},
            "foo-edit",
        ),
        lambda _request: _tool_result("foo-edit", "edited"),
    )
    guard.wrap_tool_call(
        _request(
            "edit_file",
            {"file_path": "/plugins/bar/index.tsx"},
            "bar-edit",
        ),
        lambda _request: _tool_result(
            "bar-edit", "Error: replacement target was not found", status="error"
        ),
    )

    assert guard.metrics.scopeResources == ["plugin:foo"]
    assert guard.metrics.attemptedChangeLayers == ["plugin_behavior"]
    assert guard.metrics.attemptedResources == ["plugin:foo", "plugin:bar"]
    assert guard.metrics.failedSideEffectAttempts == 1


def test_failed_composition_mutation_does_not_authorize_new_instance():
    guard = ScopeAwareRecoveryGuard()
    guard.wrap_tool_call(
        _request(
            "mutate_app_ui_model",
            {
                "operations": [
                    {"type": "set_plugin_enabled", "instanceId": "foo-main", "enabled": False}
                ]
            },
            "foo-mutation",
        ),
        lambda _request: _tool_result(
            "foo-mutation", {"ok": True, "result": {}}
        ),
    )
    guard.wrap_tool_call(
        _request(
            "mutate_app_ui_model",
            {
                "operations": [
                    {"type": "set_plugin_enabled", "instanceId": "bar-main", "enabled": False}
                ]
            },
            "bar-failed-mutation",
        ),
        lambda _request: _tool_result(
            "bar-failed-mutation",
            {
                "ok": False,
                "error": {
                    "code": "OPERATION_PRECONDITION_FAILED",
                    "category": "workspace_integrity",
                },
            },
        ),
    )

    blocked = guard.wrap_tool_call(
        _request(
            "mutate_app_ui_model",
            {
                "operations": [
                    {"type": "set_plugin_enabled", "instanceId": "bar-main", "enabled": False}
                ]
            },
            "bar-repair",
        ),
        lambda _request: (_ for _ in ()).throw(AssertionError("must not run")),
    )

    assert json.loads(blocked.content)["error"]["code"] == (
        "CROSS_RESOURCE_REPAIR_PROHIBITED"
    )
    assert guard.metrics.scopeResources == [
        "app-ui-model",
        "plugin-instance:foo-main",
    ]
    assert "plugin-instance:bar-main" in guard.metrics.attemptedResources


def test_successful_second_resource_expands_committed_scope():
    guard = ScopeAwareRecoveryGuard()
    for plugin_id in ("foo", "bar"):
        guard.wrap_tool_call(
            _request(
                "edit_file",
                {"file_path": f"/plugins/{plugin_id}/index.tsx"},
                f"{plugin_id}-edit",
            ),
            lambda _request: _tool_result("edit", "edited"),
        )

    assert guard.metrics.scopeResources == ["plugin:foo", "plugin:bar"]
    assert guard.metrics.attemptedResources == ["plugin:foo", "plugin:bar"]
    assert guard.metrics.crossLayerTransitionCount == 0


def test_service_confirmation_only_commits_formal_authorization():
    guard = ScopeAwareRecoveryGuard()
    guard.wrap_tool_call(
        _request(
            "prepare_ui_service_contract_change",
            {"serviceName": "ConversationService"},
            "proposal",
        ),
        lambda _request: _tool_result(
            "proposal",
            {
                "ok": True,
                "result": {
                    "status": "confirmation-required",
                    "proposalId": "proposal-1",
                },
            },
        ),
    )
    assert guard.metrics.scopeResources == []

    guard.wrap_tool_call(
        _request(
            "prepare_ui_service_contract_change",
            {"proposalId": "proposal-1"},
            "authorization",
        ),
        lambda _request: _tool_result(
            "authorization",
            {
                "ok": True,
                "result": {
                    "status": "authorized",
                    "authorizationId": "authorization-1",
                    "proposal": {"serviceName": "ConversationService"},
                },
            },
        ),
    )

    assert guard.metrics.scopeResources == ["service:ConversationService"]
    assert guard.metrics.attemptedResources == ["service:ConversationService"]


def test_inspection_result_does_not_expand_resource_scope():
    guard = ScopeAwareRecoveryGuard()
    request = SimpleNamespace(
        tool_call={
            "name": "inspect_ui_plugin",
            "args": {"pluginId": "unrelated-plugin"},
            "id": "inspect",
        }
    )

    guard.wrap_tool_call(
        request,
        lambda _request: ToolMessage(
            content=(
                '{"ok":true,"result":{"pluginId":"unrelated-plugin",'
                '"changedPaths":["/plugins/unrelated-plugin/index.tsx"]}}'
            ),
            tool_call_id="inspect",
            name="inspect_ui_plugin",
        ),
    )

    assert guard.metrics.scopeResources == []


@pytest.mark.parametrize("source_root", ["src/agent-ui", "client/custom-agent"])
def test_managed_source_paths_preserve_scope_identity(tmp_path, source_root):
    from agent_ui_creator.resource_scope import change_layer_for_path, resource_keys_for_path

    (tmp_path / ".agent-ui").mkdir()
    (tmp_path / ".agent-ui/project.json").write_text(json.dumps({
        "version": "2", "sourceRoot": source_root,
    }))
    app_path = f"{source_root}/app-ui/app-ui.json"
    plugin_path = f"{source_root}/plugins/sample/index.tsx"
    assert change_layer_for_path(app_path, project_root=tmp_path) == "composition"
    assert resource_keys_for_path(app_path, project_root=tmp_path) == ("app-ui-model",)
    assert change_layer_for_path(str(tmp_path / plugin_path), project_root=tmp_path) == "plugin_behavior"
    assert resource_keys_for_path(plugin_path, project_root=tmp_path) == ("plugin:sample",)
    assert change_layer_for_path("src/host/App.tsx", project_root=tmp_path) is None
    guard = ScopeAwareRecoveryGuard(project_root=str(tmp_path))
    guard.wrap_tool_call(_request("edit_file", {"file_path": "/" + plugin_path}, "managed-edit"),
                         lambda _: ToolMessage(content="Successfully edited file", tool_call_id="managed-edit"))
    assert guard.metrics.taskChangeLayers == ["plugin_behavior"]
    assert guard.metrics.scopeResources == ["plugin:sample"]
