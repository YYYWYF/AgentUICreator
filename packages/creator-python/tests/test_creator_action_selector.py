from __future__ import annotations

import asyncio
import hashlib
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
        "label": "Move History to Workspace.Right",
        "description": "Move the History Plugin to the semantic Workspace.Right Region.",
        "target": {
            "pluginId": "history",
            "pluginName": "History",
            "instanceId": "history-main",
        },
        "effect": effect or {"type": "workspace_region", "region": "right"},
    }


CONVERSATION_THREAD_LIST_ADD_ACTION_ID = "act_" + hashlib.sha256(
    b'{"kind":"add_existing_plugin","subject":{"pluginId":"conversation-thread-list"},"effect":{"type":"add_default"}}'
).hexdigest()[:24]


def add_action(
    action_id: str = CONVERSATION_THREAD_LIST_ADD_ACTION_ID,
) -> dict[str, object]:
    return {
        "actionId": action_id,
        "kind": "add_existing_plugin",
        "status": "ready",
        "label": "Add Conversation Thread List",
        "description": (
            "Add the existing Conversation Thread List Plugin using its default placement."
        ),
        "target": {
            "pluginId": "conversation-thread-list",
            "pluginName": "Conversation Thread List",
        },
        "effect": {"type": "add_default"},
    }


def context(*, right_status: str = "ready") -> CreatorActionSelectorContext:
    return CreatorActionSelectorContext(
        catalogRevision="c" * 64,
        actions=[
            action("act_history_right", status=right_status),
            action(
                "act_history_left",
                effect={"type": "workspace_region", "region": "left"},
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
    assert selector.metrics.candidateCount == 2
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
    assert "Copy exactly one actionId" in feedback
    assert "schema" not in feedback.lower()
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
    assert raised.value.details["reasonCode"] == "unknown_action_id"
    assert raised.value.details["reason"] == (
        "The selected actionId is not one of the supplied current Action Candidates."
    )
    assert raised.value.details["returnedActionId"] == "act_still_invented"
    assert raised.value.details["candidateCount"] == 2
    assert raised.value.details["candidateActionIds"] == [
        "act_history_right",
        "act_history_left",
    ]
    assert selector.metrics.modelCalls == 2
    assert selector.metrics.repairCalls == 1
    assert selector.metrics.invalidResponses == 2


def test_selector_repairs_schema_failure_with_schema_specific_feedback():
    model = StaticStructuredModel(
        [
            {"decision": "select_action"},
            {"decision": "select_action", "actionId": "act_history_right"},
        ]
    )
    selector = CreatorActionSelector(structured_model=model)

    result = asyncio.run(selector.select("把会话管理放到右边", context()))

    assert result.actionId == "act_history_right"
    feedback = json.loads(model.messages[1][1].content)["hostValidationFeedback"]
    assert "did not satisfy the CreatorActionSelection schema" in feedback
    assert "not one of the supplied current Action Candidates" not in feedback
    assert selector.metrics.modelCalls == 2
    assert selector.metrics.repairCalls == 1
    assert selector.metrics.invalidResponses == 1


def test_selector_repairs_structured_parse_failure_with_parse_specific_feedback():
    model = StaticStructuredModel(
        [
            {
                "parsed": None,
                "parsing_error": ValueError("synthetic parse failure"),
            },
            {"decision": "select_action", "actionId": "act_history_right"},
        ]
    )
    selector = CreatorActionSelector(structured_model=model)

    result = asyncio.run(selector.select("把会话管理放到右边", context()))

    assert result.actionId == "act_history_right"
    feedback = json.loads(model.messages[1][1].content)["hostValidationFeedback"]
    assert "could not be parsed" in feedback
    assert "Do not add prose" in feedback
    assert "did not satisfy the CreatorActionSelection schema" not in feedback
    assert selector.metrics.modelCalls == 2
    assert selector.metrics.repairCalls == 1
    assert selector.metrics.invalidResponses == 1


def test_selector_fails_with_structured_parse_reason_after_one_repair():
    model = StaticStructuredModel(
        [
            {
                "parsed": None,
                "parsing_error": ValueError("first parse failure"),
            },
            {
                "parsed": None,
                "parsing_error": ValueError("second parse failure"),
            },
        ]
    )
    selector = CreatorActionSelector(structured_model=model)

    with pytest.raises(CreatorActionSelectionError) as raised:
        asyncio.run(selector.select("把会话管理放到右边", context()))

    assert raised.value.details["attempts"] == 2
    assert raised.value.details["reasonCode"] == "structured_parse_failed"
    assert raised.value.details["reason"] == (
        "Structured Action Selector output could not be parsed."
    )
    assert raised.value.details["cause"] == "second parse failure"


def test_selector_accepts_the_conversation_thread_list_add_action():
    source = context().model_dump(mode="python")
    source["actions"] = [add_action()]
    source["pluginSemantics"] = [
        {
            "pluginId": "conversation-thread-list",
            "name": "Conversation Thread List",
            "description": "Manage and select conversation history.",
            "capabilities": [
                "conversation-create",
                "conversation-history",
                "conversation-selection",
            ],
            "intents": [
                "add conversation management",
                "browse conversation history",
                "select an existing conversation",
                "start a new conversation",
            ],
            "visualRole": "conversation navigation",
        }
    ]
    thread_list_context = CreatorActionSelectorContext.model_validate(source)
    model = StaticStructuredModel(
        [{"decision": "select_action", "actionId": CONVERSATION_THREAD_LIST_ADD_ACTION_ID}]
    )
    selector = CreatorActionSelector(structured_model=model)

    result = asyncio.run(
        selector.select("我想要新增会话管理的功能", thread_list_context)
    )

    assert result.decision == "select_action"
    assert result.actionId == CONVERSATION_THREAD_LIST_ADD_ACTION_ID
    assert selector.metrics.modelCalls == 1
    assert selector.metrics.repairCalls == 0


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


def test_selector_center_only_context_exposes_no_platform_side_actions():
    model = StaticStructuredModel(
        [{"decision": "select_action", "actionId": "act_history_center"}]
    )
    source = context().model_dump(mode="python")
    source["actions"] = [
        action(
            "act_history_center",
            effect={"type": "workspace_region", "region": "center"},
        )
    ]
    center_only = CreatorActionSelectorContext.model_validate(source)
    selector = CreatorActionSelector(structured_model=model)

    result = asyncio.run(selector.select("把 History 放中间", center_only))

    assert result.actionId == "act_history_center"
    serialized = json.dumps(model.messages, ensure_ascii=False, default=str)
    assert "act_history_left" not in serialized
    assert "act_history_right" not in serialized


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
