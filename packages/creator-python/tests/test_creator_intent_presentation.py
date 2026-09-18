from agent_ui_creator.operations import (
    CreatorOperationResolution,
    PluginCapability,
    PluginCapabilityIndex,
    PluginInstanceSummary,
    present_creator_intent,
)


def _plugin_index() -> PluginCapabilityIndex:
    return PluginCapabilityIndex(
        plugins=[
            PluginCapability(
                pluginId="conversation-thread-list",
                name="Conversation Thread List",
                description="History navigation",
                selected=True,
                instances=[
                    PluginInstanceSummary(
                        instanceId="conversation-thread-list-main",
                        enabled=True,
                    )
                ],
            )
        ]
    )


def test_intent_presentation_projects_plugin_name_without_second_model_call():
    presentation = present_creator_intent(
        CreatorOperationResolution(
            kind="remove_plugin",
            targetPluginIds=["conversation-thread-list"],
            targetInstanceIds=["conversation-thread-list-main"],
        ),
        _plugin_index(),
    )

    assert presentation.label == "移除 Conversation Thread List"
    assert presentation.kind == "remove_plugin"
    assert presentation.route == "productized"
    assert presentation.to_dict() == {
        "displayIntent": "移除 Conversation Thread List",
        "intent": "remove_plugin",
        "targetPluginIds": ["conversation-thread-list"],
        "targetInstanceIds": ["conversation-thread-list-main"],
        "route": "productized",
    }


def test_general_change_presentation_keeps_general_fallback_route():
    presentation = present_creator_intent(
        CreatorOperationResolution(
            kind="modify_plugin_logic",
            targetPluginIds=["conversation-thread-list"],
        ),
        _plugin_index(),
    )

    assert presentation.label == "修改 Conversation Thread List 的逻辑"
    assert presentation.route == "general-agent"


def test_move_plugin_presentation_is_not_clarification():
    presentation = present_creator_intent(
        CreatorOperationResolution(
            kind="move_plugin",
            targetPluginIds=["conversation-thread-list"],
            targetInstanceIds=["conversation-thread-list-main"],
            placement={
                "type": "relative",
                "anchorPluginId": "conversation-surface",
                "anchorInstanceId": "conversation-surface-main",
                "relation": "after",
            },
        ),
        _plugin_index(),
    )

    assert presentation.label == "移动 Conversation Thread List"
    assert presentation.label != "需要确认修改目标"
    assert presentation.kind == "move_plugin"
    assert presentation.route == "general-agent"
