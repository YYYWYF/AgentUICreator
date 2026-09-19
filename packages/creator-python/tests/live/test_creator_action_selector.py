from __future__ import annotations

import asyncio
import os

import pytest

from agent_ui_creator.model_factory import create_creator_chat_model
from agent_ui_creator.model_settings import CreatorModelSettings
from agent_ui_creator.operations import CreatorActionSelector, CreatorActionSelectorContext


def _context() -> CreatorActionSelectorContext:
    return CreatorActionSelectorContext(
        catalogRevision="c" * 64,
        actions=[
            {
                "actionId": "act_history_right",
                "kind": "move_plugin",
                "status": "ready",
                "label": "Move History to the current row's right edge",
                "description": "Move the History Plugin to the right edge of its current Row.",
                "target": {
                    "pluginId": "history",
                    "pluginName": "History",
                    "instanceId": "history-main",
                },
                "effect": {"type": "row_edge", "edge": "right"},
            },
            {
                "actionId": "act_history_left",
                "kind": "move_plugin",
                "status": "ready",
                "label": "Move History to the current row's left edge",
                "description": "Move the History Plugin to the left edge of its current Row.",
                "target": {
                    "pluginId": "history",
                    "pluginName": "History",
                    "instanceId": "history-main",
                },
                "effect": {"type": "row_edge", "edge": "left"},
            },
            {
                "actionId": "act_history_after_conversation",
                "kind": "move_plugin",
                "status": "ready",
                "label": "Move History after Conversation",
                "description": "Move the History Plugin after the Conversation Plugin.",
                "target": {
                    "pluginId": "history",
                    "pluginName": "History",
                    "instanceId": "history-main",
                },
                "effect": {
                    "type": "relative",
                    "anchorPluginId": "conversation",
                    "anchorPluginName": "Conversation",
                    "anchorInstanceId": "conversation-main",
                    "relation": "after",
                },
            },
            {
                "actionId": "act_history_remove",
                "kind": "remove_plugin",
                "status": "ready",
                "label": "Remove History",
                "description": "Remove the History Plugin instance.",
                "target": {
                    "pluginId": "history",
                    "pluginName": "History",
                    "instanceId": "history-main",
                },
                "effect": {"type": "remove"},
            },
        ],
        pluginSemantics=[
            {
                "pluginId": "history",
                "name": "History",
                "description": "Browse and select conversation history.",
                "capabilities": ["conversation-history"],
                "intents": [
                    "add conversation management",
                    "browse conversation history",
                    "select an existing conversation",
                ],
                "visualRole": "conversation navigation",
            },
            {
                "pluginId": "conversation",
                "name": "Conversation",
                "description": "Show and send conversation messages.",
                "capabilities": ["conversation-surface"],
                "intents": ["show conversation", "send messages"],
                "visualRole": "conversation surface",
            },
        ],
    )


def _ambiguous_context() -> CreatorActionSelectorContext:
    value = _context().model_dump(mode="python")
    first = value["actions"][0]
    second = {
        **first,
        "actionId": "act_history_secondary_right",
        "target": {
            "pluginId": "history",
            "pluginName": "History",
            "instanceId": "history-secondary",
        },
    }
    value["actions"] = [first, second]
    return CreatorActionSelectorContext.model_validate(value)


@pytest.mark.live_model
@pytest.mark.skipif(
    os.environ.get("CREATOR_RUN_LIVE_MODEL") != "1",
    reason="Set CREATOR_RUN_LIVE_MODEL=1 to run the live Action Selector evaluation pack.",
)
@pytest.mark.parametrize(
    ("prompt", "expected_action"),
    [
        ("把会话管理移到最右边", "act_history_right"),
        ("把会话管理放到右边", "act_history_right"),
        ("把历史会话挪到最右侧", "act_history_right"),
        ("历史会话别放左边了，挪过去", "act_history_right"),
        ("把 History 放到这一行最后", "act_history_right"),
        ("把 History 放在 Conversation 后面", "act_history_after_conversation"),
    ],
)
def test_live_creator_action_selector_semantics(prompt, expected_action):
    settings = CreatorModelSettings.from_environment()
    selector = CreatorActionSelector(
        model=create_creator_chat_model(settings),
        max_retries=settings.max_retries,
    )

    result = asyncio.run(selector.select(prompt, _context()))

    assert result.decision == "select_action"
    assert result.actionId == expected_action
    assert selector.metrics.modelCalls == 1
    assert selector.metrics.repairCalls == 0


@pytest.mark.live_model
@pytest.mark.skipif(
    os.environ.get("CREATOR_RUN_LIVE_MODEL") != "1",
    reason="Set CREATOR_RUN_LIVE_MODEL=1 to run the live Action Selector evaluation pack.",
)
@pytest.mark.parametrize(
    ("prompt", "decision"),
    [
        ("把会话管理移到最上面", "unsupported_product_action"),
        ("让会话管理支持按标题模糊搜索", "general_change"),
        (
            "把会话管理移到右边，同时删除 Remove History",
            "unsupported_product_action",
        ),
    ],
)
def test_live_creator_action_selector_route_semantics(prompt, decision):
    settings = CreatorModelSettings.from_environment()
    selector = CreatorActionSelector(
        model=create_creator_chat_model(settings),
        max_retries=settings.max_retries,
    )

    result = asyncio.run(selector.select(prompt, _context()))

    assert result.decision == decision
    assert result.actionId is None
    assert selector.metrics.modelCalls == 1
    assert selector.metrics.repairCalls == 0


@pytest.mark.live_model
@pytest.mark.skipif(
    os.environ.get("CREATOR_RUN_LIVE_MODEL") != "1",
    reason="Set CREATOR_RUN_LIVE_MODEL=1 to run the live Action Selector evaluation pack.",
)
def test_live_creator_action_selector_asks_for_ambiguous_instance():
    settings = CreatorModelSettings.from_environment()
    selector = CreatorActionSelector(
        model=create_creator_chat_model(settings),
        max_retries=settings.max_retries,
    )

    result = asyncio.run(
        selector.select("把这个 History 移到右边", _ambiguous_context())
    )

    assert result.decision == "needs_clarification"
    assert result.actionId is None
    assert result.clarificationQuestion
    assert selector.metrics.modelCalls == 1
    assert selector.metrics.repairCalls == 0
