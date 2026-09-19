from __future__ import annotations

import asyncio
import json

import pytest
from pydantic import ValidationError

from agent_ui_creator.operations import (
    CreatorActionSelection,
    CreatorActionSelectionError,
    CreatorActionSelector,
    CreatorActionSelectorContext,
)


class StaticStructuredModel:
    def __init__(self, responses):
        self.responses = list(responses)
        self.messages = []

    async def ainvoke(self, messages):
        self.messages.append(messages)
        response = self.responses.pop(0)
        if isinstance(response, BaseException):
            raise response
        return response


def action(
    action_id: str,
    *,
    status: str = "ready",
    effect: dict[str, object] | None = None,
) -> dict[str, object]:
    return {
        "actionId": action_id,
        "kind": "move_plugin",
        "status": status,
        "label": "Move History to the current row's right edge",
        "description": "Move the History Plugin to the right edge of its current Row.",
        "target": {
            "pluginId": "history",
            "pluginName": "History",
            "instanceId": "history-main",
        },
        "effect": effect or {"type": "row_edge", "edge": "right"},
    }


def context(*, right_status: str = "ready") -> CreatorActionSelectorContext:
    return CreatorActionSelectorContext(
        catalogRevision="c" * 64,
        actions=[
            action("act_history_right", status=right_status),
            action(
                "act_history_left",
                effect={"type": "row_edge", "edge": "left"},
            ),
            action(
                "act_history_after_conversation",
                effect={
                    "type": "relative",
                    "anchorPluginId": "conversation",
                    "anchorPluginName": "Conversation",
                    "anchorInstanceId": "conversation-main",
                    "relation": "after",
                },
            ),
        ],
        pluginSemantics=[
            {
                "pluginId": "history",
                "name": "History",
                "description": "Browse conversation history.",
                "capabilities": ["conversation-history"],
                "intents": ["browse conversation history"],
                "visualRole": "conversation navigation",
            },
            {
                "pluginId": "conversation",
                "name": "Conversation",
                "description": "Show conversation messages.",
                "capabilities": ["conversation-surface"],
                "intents": ["show conversation"],
                "visualRole": "conversation surface",
            },
        ],
    )


def test_selector_selects_an_exact_supplied_action_once():
    model = StaticStructuredModel(
        [{"decision": "select_action", "actionId": "act_history_right"}]
    )
    selector = CreatorActionSelector(structured_model=model)

    result = asyncio.run(
        selector.select("把会话管理移到最右边", context())
    )

    assert result.actionId == "act_history_right"
    assert selector.metrics.modelCalls == 1
    assert selector.metrics.repairCalls == 0
    assert selector.metrics.invalidResponses == 0
    assert selector.metrics.candidateCount == 3
    assert selector.metrics.contextCharacters > 0


def test_selector_repairs_one_unknown_action_id_with_host_feedback():
    model = StaticStructuredModel(
        [
            {"decision": "select_action", "actionId": "act_invented"},
            {"decision": "select_action", "actionId": "act_history_right"},
        ]
    )
    selector = CreatorActionSelector(structured_model=model)

    result = asyncio.run(selector.select("把会话管理放到右边", context()))

    assert result.actionId == "act_history_right"
    assert selector.metrics.modelCalls == 2
    assert selector.metrics.repairCalls == 1
    assert selector.metrics.invalidResponses == 1
    feedback = json.loads(model.messages[1][1].content)["hostValidationFeedback"]
    assert "not one of the supplied current Action Candidates" in feedback
    assert "Do not reinterpret the original user request" in feedback


def test_selector_fails_after_one_bounded_repair():
    model = StaticStructuredModel(
        [
            {"decision": "select_action", "actionId": "act_invented"},
            {"decision": "select_action", "actionId": "act_still_invented"},
        ]
    )
    selector = CreatorActionSelector(structured_model=model)

    with pytest.raises(CreatorActionSelectionError) as raised:
        asyncio.run(selector.select("把会话管理放到右边", context()))

    assert raised.value.code == "ACTION_SELECTION_FAILED"
    assert raised.value.details["attempts"] == 2
    assert selector.metrics.modelCalls == 2
    assert selector.metrics.repairCalls == 1
    assert selector.metrics.invalidResponses == 2


def test_selector_accepts_already_satisfied_actions():
    model = StaticStructuredModel(
        [{"decision": "select_action", "actionId": "act_history_right"}]
    )
    selector = CreatorActionSelector(structured_model=model)

    result = asyncio.run(
        selector.select(
            "把会话管理放最右边",
            context(right_status="already_satisfied"),
        )
    )

    assert result.actionId == "act_history_right"


@pytest.mark.parametrize(
    "selection",
    [
        {"decision": "select_action"},
        {
            "decision": "select_action",
            "actionId": "act_history_right",
            "clarificationQuestion": "Which one?",
        },
        {
            "decision": "needs_clarification",
            "clarificationQuestion": " ",
        },
        {
            "decision": "needs_clarification",
            "actionId": "act_history_right",
            "clarificationQuestion": "Which one?",
        },
        {"decision": "general_change", "actionId": "act_history_right"},
        {
            "decision": "unsupported_product_action",
            "clarificationQuestion": "Which one?",
        },
    ],
)
def test_selector_output_schema_is_strict(selection):
    with pytest.raises(ValidationError):
        CreatorActionSelection.model_validate(selection)


def test_selector_message_context_contains_no_execution_details():
    model = StaticStructuredModel(
        [{"decision": "general_change"}]
    )
    selector = CreatorActionSelector(structured_model=model)

    asyncio.run(selector.select("让历史支持模糊搜索", context()))

    serialized = json.dumps(
        [
            [
                getattr(message, "content", "")
                for message in messages
            ]
            for messages in model.messages
        ],
        ensure_ascii=False,
    )
    for forbidden in (
        "bindings",
        "move_plugin_to",
        "insert_plugin_default",
        "remove_plugin_default",
        "layoutRef",
        "slotRef",
        "app-ui.json",
    ):
        assert forbidden not in serialized

