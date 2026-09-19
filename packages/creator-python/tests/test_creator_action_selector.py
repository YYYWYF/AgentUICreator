from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest
from langchain_core.messages import AIMessage
from pydantic import ValidationError

from agent_ui_creator.operations import (
    CreatorActionSelection,
    CreatorActionSelectionError,
    CreatorActionSelector,
    CreatorActionSelectorContext,
)
from agent_ui_creator.operations.selector import (
    _InvalidActionSelection,
    _parse_selector_response,
)
from agent_ui_creator.model_settings import CreatorSelectorModelSettings


class StaticChatModel:
    def __init__(self, responses: list[str | BaseException]):
        self.responses = list(responses)
        self.messages: list[list[object]] = []

    async def ainvoke(self, messages):
        self.messages.append(messages)
        response = self.responses.pop(0)
        if isinstance(response, BaseException):
            raise response
        if isinstance(response, AIMessage):
            return response
        return AIMessage(content=response)


class CopyingChatModel(StaticChatModel):
    def __init__(self, responses):
        super().__init__(responses)
        self.copy_update = None

    def model_copy(self, *, update):
        self.copy_update = update
        return self


class StaticTraceCollector:
    def __init__(self, traces):
        self.traces = list(traces)

    def pop_successful_completion(self):
        return self.traces.pop(0)


def _action(action_id: str, region: str, *, status: str = "ready") -> dict:
    return {
        "actionId": action_id,
        "kind": "move_plugin",
        "status": status,
        "label": f"Move History to Workspace.{region.title()}",
        "description": f"Move History to the semantic Workspace.{region.title()} Region.",
        "target": {
            "pluginId": "history",
            "pluginName": "History",
            "instanceId": "history-main",
        },
        "effect": {"type": "workspace_region", "region": region},
    }


def _context(*, right_status: str = "ready") -> CreatorActionSelectorContext:
    return CreatorActionSelectorContext(
        catalogRevision="c" * 64,
        actions=[
            _action("act_history_right", "right", status=right_status),
            _action("act_history_left", "left"),
        ],
        pluginSemantics=[
            {
                "pluginId": "history",
                "name": "History",
                "description": "Navigate conversation history.",
                "capabilities": ["conversation-history"],
                "intents": ["browse past conversations"],
            }
        ],
    )


def _payload(model: StaticChatModel, attempt: int = 0) -> dict:
    return json.loads(model.messages[attempt][1].content)


@pytest.mark.parametrize(
    ("response", "decision", "action_id"),
    [
        ("SELECT A1\n", "select_action", "act_history_right"),
        ("SELECT A2", "select_action", "act_history_left"),
        ("GENERAL", "general_change", None),
        ("UNSUPPORTED", "unsupported_product_action", None),
        ("CLARIFY 你指的是哪个会话列表？", "needs_clarification", None),
    ],
)
def test_protocol_parser_accepts_exact_lines(response, decision, action_id):
    choices = {"A1": _context().actions[0], "A2": _context().actions[1]}

    result = _parse_selector_response(response, choices)

    assert result.decision == decision
    assert result.actionId == action_id
    if decision == "needs_clarification":
        assert result.clarificationQuestion == "你指的是哪个会话列表？"


def test_protocol_parser_accepts_a10():
    candidate = _context().actions[0]
    assert _parse_selector_response("SELECT A10", {"A10": candidate}).actionId == (
        candidate.actionId
    )


@pytest.mark.parametrize(
    ("response", "reason"),
    [
        ("A1", "protocol_parse_failed"),
        ("select A1", "protocol_parse_failed"),
        ("SELECT act_history_right", "protocol_parse_failed"),
        ("SELECT A0", "protocol_parse_failed"),
        ("SELECT A99", "unknown_choice_key"),
        ("I choose A1", "protocol_parse_failed"),
        ("SELECT A1 because it matches", "protocol_parse_failed"),
        ('{"decision":"select_action"}', "protocol_parse_failed"),
        ("```SELECT A1```", "protocol_parse_failed"),
        ("", "protocol_parse_failed"),
        ("GENERAL\nSELECT A1", "protocol_parse_failed"),
        ("CLARIFY " + "x" * 1000, "protocol_parse_failed"),
    ],
)
def test_protocol_parser_rejects_invalid_lines(response, reason):
    with pytest.raises(_InvalidActionSelection) as raised:
        _parse_selector_response(response, {"A1": _context().actions[0]})
    assert raised.value.reason_code == reason


def test_selector_maps_ephemeral_choice_to_exact_host_action():
    model = StaticChatModel(["SELECT A1"])
    selector = CreatorActionSelector(model=model)

    result = asyncio.run(selector.select("把会话管理放到右边", _context()))

    assert result == CreatorActionSelection(
        decision="select_action", actionId="act_history_right"
    )
    payload = _payload(model)
    assert [choice["choice"] for choice in payload["choices"]] == ["A1", "A2"]
    assert "act_" not in model.messages[0][1].content
    assert "catalogRevision" not in payload
    assert payload["choices"][0]["effect"]["region"] == "right"
    assert payload["pluginSemantics"][0]["pluginId"] == "history"
    assert selector.metrics.modelCalls == 1
    assert selector.metrics.repairCalls == 0


def test_selector_uses_its_own_generation_policy():
    model = CopyingChatModel(["GENERAL"])
    selector = CreatorActionSelector(
        model=model,
        selector_settings=CreatorSelectorModelSettings(max_tokens=512, reasoning_effort="low"),
    )

    asyncio.run(selector.select("让历史支持模糊搜索", _context()))

    assert model.copy_update == {
        "streaming": False,
        "temperature": None,
        "max_tokens": 512,
        "reasoning_effort": "low",
    }


def test_selector_recovery_reapplies_generation_policy():
    original = CopyingChatModel(["GENERAL"])
    recovered = CopyingChatModel(["GENERAL"])
    selector = CreatorActionSelector(
        model=original,
        recovery_factory=lambda: recovered,
        selector_settings=CreatorSelectorModelSettings(max_tokens=512, reasoning_effort="low"),
    )

    asyncio.run(selector._recover_invocation_model())

    assert recovered.copy_update == original.copy_update == {
        "streaming": False,
        "temperature": None,
        "max_tokens": 512,
        "reasoning_effort": "low",
    }


def test_empty_length_response_fails_without_semantic_repair():
    model = StaticChatModel([AIMessage(
        content="",
        response_metadata={
            "finish_reason": "length",
            "token_usage": {"prompt_tokens": 1500, "completion_tokens": 130, "total_tokens": 1630},
        },
    )])
    selector = CreatorActionSelector(model=model)

    with pytest.raises(CreatorActionSelectionError) as raised:
        asyncio.run(selector.select("我不想要会话管理", _context()))

    assert raised.value.details == {
        "attempts": 1,
        "reasonCode": "output_budget_exhausted",
        "finishReason": "length",
        "promptTokens": 1500,
        "completionTokens": 130,
        "totalTokens": 1630,
    }
    assert selector.metrics.modelCalls == 1
    assert selector.metrics.repairCalls == 0
    assert selector.metrics.reasoningTokens is None


def test_complete_choice_is_accepted_even_with_length_finish_reason():
    model = StaticChatModel([AIMessage(
        content="SELECT A1", response_metadata={"finish_reason": "length"}
    )])

    result = asyncio.run(CreatorActionSelector(model=model).select("移动历史", _context()))

    assert result.actionId == "act_history_right"


@pytest.mark.parametrize(
    ("first", "reason"),
    [
        ("I choose A1", "protocol_parse_failed"),
        ("SELECT A99", "unknown_choice_key"),
    ],
)
def test_selector_repairs_once_with_stable_choice_mapping(first, reason):
    model = StaticChatModel([first, "SELECT A1"])
    selector = CreatorActionSelector(model=model)

    result = asyncio.run(selector.select("把会话管理放到右边", _context()))

    assert result.actionId == "act_history_right"
    assert selector.metrics.modelCalls == 2
    assert selector.metrics.repairCalls == 1
    assert selector.metrics.invalidResponses == 1
    assert selector.metrics.repairReasonCode == reason
    assert _payload(model, 0)["choices"] == _payload(model, 1)["choices"]
    feedback = _payload(model, 1)["hostValidationFeedback"]
    assert "A1, A2" in feedback
    assert "Do not reinterpret" in feedback
    assert "act_" not in model.messages[1][1].content


def test_selector_fails_closed_after_one_invalid_repair():
    model = StaticChatModel(["garbage", "still garbage"])
    selector = CreatorActionSelector(model=model)

    with pytest.raises(CreatorActionSelectionError) as raised:
        asyncio.run(selector.select("把会话管理放到右边", _context()))

    assert raised.value.code == "ACTION_SELECTION_FAILED"
    assert raised.value.details["attempts"] == 2
    assert raised.value.details["reasonCode"] == "protocol_parse_failed"
    assert selector.metrics.modelCalls == 2
    assert selector.metrics.repairCalls == 1
    assert selector.metrics.invalidResponses == 2


def test_debug_trace_records_only_bounded_invalid_selector_responses():
    events = []
    model = StaticChatModel(["x" * 400, "SELECT A1."])
    traces = StaticTraceCollector([
        SimpleNamespace(
            contentType="string", contentLength=400, contentBlockTypes=(),
            contentKeys=(), hasReasoningContent=False, finishReason="stop",
            toolCallCount=0, pseudoToolIntent=False, textualToolIntent=False,
        ),
        SimpleNamespace(
            contentType="string", contentLength=10, contentBlockTypes=(),
            contentKeys=(), hasReasoningContent=False, finishReason="stop",
            toolCallCount=0, pseudoToolIntent=False, textualToolIntent=False,
        ),
    ])
    selector = CreatorActionSelector(
        model=model,
        provider_trace_collector=traces,
        invalid_response_logger=lambda name, data: events.append((name, data)),
    )

    with pytest.raises(CreatorActionSelectionError):
        asyncio.run(selector.select("我不想要会话管理", _context()))

    events = [event for event in events if event[0] == "action_selector_invalid_response"]
    assert [event[0] for event in events] == [
        "action_selector_invalid_response", "action_selector_invalid_response"
    ]
    assert [event[1]["attempt"] for event in events] == [1, 2]
    assert events[0][1]["responseType"] == "str"
    assert events[0][1]["responseLength"] == 400
    assert events[0][1]["contentType"] == "string"
    assert events[0][1]["responsePreview"] == "x" * 300
    assert events[1][1]["responsePreview"] == "SELECT A1."
    assert events[1][1]["finishReason"] == "stop"
    assert all("userMessage" not in data for _, data in events)


def test_debug_trace_records_content_blocks_without_text_preview():
    events = []
    model = StaticChatModel([[{"type": "text", "text": "SELECT A1"}], "SELECT A1"])
    selector = CreatorActionSelector(
        model=model,
        provider_trace_collector=StaticTraceCollector([None, None]),
        invalid_response_logger=lambda name, data: events.append((name, data)),
    )

    result = asyncio.run(selector.select("我不想要会话管理", _context()))

    events = [event for event in events if event[0] == "action_selector_invalid_response"]
    assert result.actionId == "act_history_right"
    assert len(events) == 1
    assert events[0][1]["responseType"] == "list"
    assert events[0][1]["contentType"] == "list"
    assert events[0][1]["contentBlockTypes"] == ["text"]
    assert "responsePreview" not in events[0][1]


def test_selector_keeps_first_repair_reason_when_second_is_different():
    selector = CreatorActionSelector(model=StaticChatModel(["SELECT A99", "garbage"]))

    with pytest.raises(CreatorActionSelectionError) as raised:
        asyncio.run(selector.select("把会话管理放到右边", _context()))

    assert selector.metrics.repairReasonCode == "unknown_choice_key"
    assert raised.value.details["reasonCode"] == "protocol_parse_failed"


@pytest.mark.parametrize(
    ("response", "decision"),
    [
        ("GENERAL", "general_change"),
        ("UNSUPPORTED", "unsupported_product_action"),
        ("CLARIFY 哪个会话列表？", "needs_clarification"),
    ],
)
def test_selector_normalizes_terminal_routes(response, decision):
    selector = CreatorActionSelector(model=StaticChatModel([response]))
    result = asyncio.run(selector.select("更改会话管理", _context()))
    assert result.decision == decision
    assert result.actionId is None


def test_selector_accepts_already_satisfied_action():
    selector = CreatorActionSelector(model=StaticChatModel(["SELECT A1"]))
    result = asyncio.run(
        selector.select("把会话管理放最右边", _context(right_status="already_satisfied"))
    )
    assert result.actionId == "act_history_right"


def test_selector_message_excludes_execution_details():
    model = StaticChatModel(["GENERAL"])
    asyncio.run(CreatorActionSelector(model=model).select("模糊搜索", _context()))
    serialized = model.messages[0][1].content
    for forbidden in (
        "bindings",
        "layoutRef",
        "destinationTrack",
        "workspace_region_move",
        "app-ui.json",
    ):
        assert forbidden not in serialized


@pytest.mark.parametrize(
    "selection",
    [
        {"decision": "select_action"},
        {"decision": "select_action", "actionId": "act_history_right", "clarificationQuestion": "Which one?"},
        {"decision": "needs_clarification", "clarificationQuestion": " "},
        {"decision": "needs_clarification", "actionId": "act_history_right", "clarificationQuestion": "Which one?"},
        {"decision": "general_change", "actionId": "act_history_right"},
    ],
)
def test_host_normalized_selection_schema_remains_strict(selection):
    with pytest.raises(ValidationError):
        CreatorActionSelection.model_validate(selection)
