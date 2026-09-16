from types import SimpleNamespace

import pytest
from langchain_core.messages import ToolMessage

from agent_ui_creator.domain_agent.change_scope import (
    ScopeAwareRecoveryGuard,
    resource_keys_for_path,
    resource_keys_for_tool_call,
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
                    {"type": "update_plugin_props", "instanceId": "bar-main"},
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
