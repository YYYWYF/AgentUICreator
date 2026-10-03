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
    CreatorActionCatalogSnapshot,
    CreatorAuthoringTargetBinding,
    CreatorAuthoringTargetCandidate,
    CreatorAuthoringTargetCatalogSnapshot,
    CreatorDomainSnapshot,
    PluginCapabilityIndex,
    PendingCreatorClarificationStore,
    unified_creator_intent_catalog_revision,
)
from agent_ui_creator.operations.selector import (
    _InvalidActionSelection,
    _SELECTOR_SYSTEM_PROMPT,
    _parse_selector_response,
)
from agent_ui_creator.model_settings import CreatorSelectorModelSettings


@pytest.mark.parametrize("line,intent", [
    ("GENERAL", "none"),
    ("GENERAL DEVELOPMENT_DECISION", "needs_decision"),
    ("GENERAL DEVELOPMENT_EXPLICIT", "explicit"),
    ("GENERAL DEVELOPMENT_CONDITIONAL", "conditional"),
    ("GENERAL DEVELOPMENT_PROHIBITED", "prohibited"),
])
def test_selector_development_intent_protocol(line, intent):
    selection = _parse_selector_response(line, {})
    assert selection.decision == "general_change"
    assert selection.developmentIntent == intent


@pytest.mark.parametrize("message,expected", [
    ("优先用项目已有能力来显示文件卡片，先用 Mock 验证。", "needs_decision"),
    ("文件卡片有现成的就用现成的，没有才开发一个。", "conditional"),
    ("Reuse the existing file card if possible; otherwise build one.", "conditional"),
])
def test_conditional_development_requires_actual_fallback_commission(message, expected):
    selector = CreatorActionSelector(model=StaticChatModel([
        "GENERAL DEVELOPMENT_CONDITIONAL",
    ]))

    result = asyncio.run(selector.select(message, _unified_context()))

    assert result.developmentIntent == expected


@pytest.mark.parametrize("message,expected", [
    (
        "在聊天区旁边给我一个任务核对清单，显示三项。每项可以勾选完成，"
        "可以筛选未完成，也可以重置。只在当前页面保存状态，不接后端。",
        "needs_decision",
    ),
    ("请开发一个独立的任务核对清单插件，使用项目现有组件。", "explicit"),
    ("授权你新增并挂载任务核对清单 Plugin，使用项目现有组件。", "explicit"),
    ("请扩展现有插件，增加本地筛选交互。", "explicit"),
    ("把已有的任务清单组件封装成 UI 插件，保留原实现。", "explicit"),
    ("先分析一下是否需要开发插件，不要修改项目。", "needs_decision"),
    ("这个是不是需要开发插件？先告诉我你的判断。", "needs_decision"),
    ("我们先讨论开发插件的可能性，不要动代码。", "needs_decision"),
    ("任务清单有现成的就用现成的，没有就开发一个插件。", "needs_decision"),
    ("现成插件能用就用，没有才新增一个 Plugin。", "needs_decision"),
    ("文档里写着“开发一个新插件”，现在只调整按钮文案。", "needs_decision"),
])
def test_explicit_development_requires_real_commission(message, expected):
    selector = CreatorActionSelector(model=StaticChatModel([
        "GENERAL DEVELOPMENT_EXPLICIT",
    ]))

    result = asyncio.run(selector.select(message, _unified_context()))

    assert result.developmentIntent == expected


@pytest.mark.parametrize("message,expected", [
    ("请新建一个会议纪要插件，沿用工程现有按钮。", "explicit"),
    ("把已有的库存表组件适配成 UI Plugin，保留它的交互。", "explicit"),
    ("请单独实现一个新的搜索过滤 Plugin，不复用已有成品。", "explicit"),
    ("请不要新建天气卡片插件，先盘点现成能力。", "needs_decision"),
    ("评估一下是否要开发客服转接插件，先给判断。", "needs_decision"),
    ("需求文档引用“创建一个考勤插件”，现在只调整既有文案。", "needs_decision"),
    ("若已有日历插件就直接用；没有才开发一个日历插件。", "needs_decision"),
])
def test_unseen_commission_phrasing_cannot_forge_explicit_grant(message, expected):
    selector = CreatorActionSelector(model=StaticChatModel([
        "GENERAL DEVELOPMENT_EXPLICIT",
    ]))

    result = asyncio.run(selector.select(message, _unified_context()))

    assert result.developmentIntent == expected


def test_development_intent_cannot_be_attached_to_read_only_selection():
    with pytest.raises(ValidationError):
        CreatorActionSelection(
            decision="read_only_analysis", developmentIntent="explicit",
        )


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


def _add_context(*, include_right: bool = True) -> CreatorActionSelectorContext:
    actions = [{
        "actionId": "act_add_default", "kind": "add_existing_plugin", "status": "ready",
        "label": "Add Conversation Thread List",
        "description": "Add the visual Plugin using its default placement.",
        "target": {"pluginId": "conversation-thread-list", "pluginName": "Conversation Thread List"},
        "effect": {"type": "add_default", "placementDomain": "workspace"},
    }]
    if include_right:
        actions.append({
            **actions[0], "actionId": "act_add_right",
            "label": "Add Conversation Thread List to Workspace.Right",
            "effect": {"type": "workspace_region", "region": "right"},
        })
    return CreatorActionSelectorContext(
        catalogRevision="c" * 64,
        actions=actions,
        pluginSemantics=[{
            "pluginId": "conversation-thread-list", "name": "Conversation Thread List",
            "description": "Visual conversation history management.",
            "capabilities": ["conversation-history"], "intents": ["manage past conversations"],
        }],
    )


def _unified_context(*, include_right: bool = True) -> CreatorActionSelectorContext:
    composition_actions = [
        {
            "actionId": "act_suggestions_add_default",
            "kind": "add_existing_plugin",
            "status": "ready",
            "label": "Add Conversation Suggestions",
            "description": "Restore the Conversation Suggestions Plugin using its default placement.",
            "target": {
                "pluginId": "conversation-suggestions",
                "pluginName": "Conversation Suggestions",
            },
            "effect": {"type": "add_default", "placementDomain": "plugin_slot"},
        },
    ]
    if include_right:
        composition_actions.append({
            "actionId": "act_theme_switch_add_default",
            "kind": "add_existing_plugin",
            "status": "ready",
            "label": "Add Theme Switch",
            "description": "Add Theme Switch to the Conversation Surface.headerActions Slot, the top-right control area of the Conversation surface.",
            "target": {
                "pluginId": "theme-switch",
                "pluginName": "Theme Switch",
            },
            "effect": {"type": "add_default", "placementDomain": "plugin_slot"},
        })
    targets = [
        {
            "targetId": "conversation.starter-suggestions",
            "kind": "application_config",
            "name": "Conversation starter suggestions",
            "description": "Application-owned starter questions shown in the empty conversation state.",
            "intents": ["change starter questions", "edit suggested prompts"],
            "relatedPluginIds": ["conversation-suggestions"],
        },
        {
            "targetId": "conversation.welcome",
            "kind": "application_config",
            "name": "Conversation welcome content",
            "description": "Application-owned welcome content for an empty conversation.",
            "intents": ["change welcome text", "customize welcome copy"],
            "relatedPluginIds": ["conversation-surface"],
        },
        {
            "targetId": "theme.default-mode",
            "kind": "application_config",
            "name": "Application default theme mode",
            "description": "Application-owned default theme mode used when the UI starts.",
            "intents": ["change default theme", "start in dark mode"],
            "relatedPluginIds": ["theme-provider", "theme-switch"],
        },
        {
            "targetId": "plugin-source:conversation-suggestions",
            "kind": "plugin_source",
            "name": "Conversation Suggestions Plugin implementation",
            "description": "Modify rendering, styling, interaction, or implementation behavior of the Conversation Suggestions Plugin.",
            "intents": [
                "modify Conversation Suggestions rendering",
                "change Conversation Suggestions styling",
                "change Conversation Suggestions interaction",
                "change Conversation Suggestions behavior",
                "modify Conversation Suggestions implementation",
            ],
            "relatedPluginIds": ["conversation-suggestions"],
        },
    ]
    candidates = [
        *[
            {
                "type": "composition_action",
                "candidateId": action["actionId"],
                "label": action["label"],
                "description": action["description"],
                "action": action,
            }
            for action in composition_actions
        ],
        *[
            {
                "type": target["kind"],
                "candidateId": target["targetId"],
                "label": target["name"],
                "description": target["description"],
                "target": target,
            }
            for target in targets
        ],
    ]
    return CreatorActionSelectorContext(
        catalogRevision="c" * 64,
        actions=composition_actions,
        pluginSemantics=[],
        intentCatalog={
            "revision": "d" * 64,
            "candidates": candidates,
        },
    )


@pytest.mark.parametrize(
    ("message", "choice", "decision", "identifier"),
    [
        ("恢复示例问题", "A1", "select_action", "act_suggestions_add_default"),
        ("把示例问题改成 A/B/C", "A3", "select_intent", "conversation.starter-suggestions"),
        ("把示例问题按钮改成圆角", "A6", "select_intent", "plugin-source:conversation-suggestions"),
        ("默认使用深色主题", "A5", "select_intent", "theme.default-mode"),
        ("把主题开关放到右边", "A2", "select_action", "act_theme_switch_add_default"),
        ("欢迎语改成 Welcome to my agent", "A4", "select_intent", "conversation.welcome"),
    ],
)
def test_unified_selector_routes_each_semantic_highway(
    message, choice, decision, identifier
):
    model = StaticChatModel([f"SELECT {choice}"])
    selector = CreatorActionSelector(model=model)

    result = asyncio.run(selector.select(message, _unified_context()))

    assert result.decision == decision
    assert (
        result.actionId if decision == "select_action" else result.targetId
    ) == identifier
    assert selector.metrics.modelCalls == 1
    assert selector.metrics.repairCalls == 0


@pytest.mark.parametrize(
    "message",
    [
        "只在当前界面隐藏示例问题，保留插件源码和其他功能。",
        "Hide the suggestions on this screen; leave the plugin source unchanged.",
    ],
)
def test_preserving_plugin_source_cannot_route_to_plugin_source_handoff(message):
    model = StaticChatModel(["SELECT A6"])
    selector = CreatorActionSelector(model=model)

    result = asyncio.run(selector.select(message, _unified_context()))

    assert result.decision == "general_change"
    assert selector.metrics.modelCalls == 1


def test_show_existing_default_presentation_does_not_edit_plugin_source():
    selector = CreatorActionSelector(model=StaticChatModel(["SELECT A6"]))

    result = asyncio.run(selector.select(
        "把示例问题显示出来，保持我们现在的默认展示方式，其他功能不变。",
        _unified_context(),
    ))

    assert result.decision == "general_change"


def test_restoring_source_and_changing_composition_cannot_select_one_atomic_action():
    model = StaticChatModel(["SELECT A1"])
    selector = CreatorActionSelector(model=model)

    result = asyncio.run(selector.select(
        "恢复插件源码，并在当前界面禁用该展示实例，其他功能不变。",
        _unified_context(),
    ))

    assert result.decision == "general_change"


def test_current_screen_hide_preserving_source_does_not_remove_instance():
    context = CreatorActionSelectorContext(
        catalogRevision="c" * 64,
        actions=[{
            "actionId": "act_remove_suggestions",
            "kind": "remove_plugin",
            "status": "ready",
            "label": "Remove Suggestions",
            "description": "Remove the Suggestions visual instance from Composition.",
            "target": {"pluginId": "suggestions", "pluginName": "Suggestions", "instanceId": "suggestions-main"},
            "effect": {"type": "remove"},
        }],
        pluginSemantics=[],
    )
    selector = CreatorActionSelector(model=StaticChatModel(["SELECT A1"]))

    result = asyncio.run(selector.select(
        "只在当前界面隐藏建议展示，保留插件源码和其他功能。",
        context,
    ))

    assert result.decision == "general_change"


def test_unified_selector_routes_unavailable_workspace_action_to_general():
    model = StaticChatModel(["SELECT A1"])

    result = asyncio.run(
        CreatorActionSelector(model=model).select(
            "我想在右边加入一个历史会话管理的面板",
            _unified_context(include_right=False),
        )
    )

    assert result.decision == "general_change"
    assert len(model.messages) == 1


def test_plugin_slot_theme_control_routes_explicit_workspace_region_to_general():
    context = _unified_context(include_right=True)
    model = StaticChatModel(["SELECT A2"])

    result = asyncio.run(
        CreatorActionSelector(model=model).select(
            "把主题开关放到 Workspace.Right 面板",
            context,
        )
    )

    assert result.decision == "general_change"


def test_domain_snapshot_binds_action_and_authoring_revisions_into_one_catalog():
    action = _add_context().actions[0]
    target = CreatorAuthoringTargetCandidate(
        targetId="conversation.starter-suggestions",
        kind="application_config",
        name="Conversation starter suggestions",
        description="Application-owned starter questions.",
        intents=["change starter questions"],
        relatedPluginIds=["conversation-suggestions"],
    )
    snapshot = CreatorDomainSnapshot(
        raw={},
        app_ui_model_hash="a" * 64,
        capability_catalog_revision="b" * 64,
        observation_coverage=(),
        plugin_index=PluginCapabilityIndex(),
        action_catalog=CreatorActionCatalogSnapshot(
            revision="c" * 64,
            candidates=[action],
        ),
        authoring_target_catalog=CreatorAuthoringTargetCatalogSnapshot(
            revision="d" * 64,
            candidates=[target],
            bindings=[CreatorAuthoringTargetBinding(
                targetId=target.targetId,
                kind=target.kind,
                ownerPath="agent-ui/conversation/config/conversation-runtime-config.ts",
                relatedPluginIds=list(target.relatedPluginIds),
            )],
        ),
    )

    context = CreatorActionSelectorContext.model_validate(snapshot.action_selector_context)

    assert context.intentCatalog is not None
    assert context.intentCatalog.revision == unified_creator_intent_catalog_revision(
        "c" * 64, "d" * 64
    )
    assert context.intentCatalog.revision != "d" * 64
    assert context.intentCatalog.revision != unified_creator_intent_catalog_revision(
        "e" * 64, "d" * 64
    )
    assert context.intentCatalog.revision != unified_creator_intent_catalog_revision(
        "c" * 64, "e" * 64
    )


def test_explicit_unavailable_region_cannot_select_default_action():
    model = StaticChatModel(["SELECT A1"])
    selection = asyncio.run(CreatorActionSelector(model=model).select(
        "我想在右边加入一个历史会话管理的面板", _add_context(include_right=False),
    ))
    assert selection.decision == "general_change"


def test_explicit_region_action_and_unplaced_default_have_distinct_selection():
    for message, response, expected in [
        ("我想在右边加入一个历史会话管理的面板", "SELECT A2", "act_add_right"),
        ("添加会话管理", "SELECT A1", "act_add_default"),
    ]:
        model = StaticChatModel([response])
        selection = asyncio.run(CreatorActionSelector(model=model).select(message, _add_context()))
        assert selection.actionId == expected


def test_reasoning_renderer_restore_selects_the_plugin_slot_add_action():
    reasoning_action = {
        "actionId": "act_reasoning_add_default",
        "kind": "add_existing_plugin",
        "status": "ready",
        "label": "Add Assistant UI Reasoning Renderer",
        "description": "Add the Assistant UI Reasoning Renderer to the Conversation Surface.reasoningGroup Slot.",
        "target": {
            "pluginId": "assistant-ui-reasoning",
            "pluginName": "Assistant UI Reasoning Renderer",
        },
        "effect": {"type": "add_default", "placementDomain": "plugin_slot"},
    }
    context = CreatorActionSelectorContext(
        catalogRevision="c" * 64,
        actions=[reasoning_action],
        pluginSemantics=[{
            "pluginId": "assistant-ui-reasoning",
            "name": "Assistant UI Reasoning Renderer",
            "description": "Displays assistant reasoning content.",
            "capabilities": ["conversation-reasoning-renderer"],
            "intents": [
                "show the reasoning process",
                "restore reasoning presentation",
                "show deep thinking",
            ],
            "visualRole": "assistant reasoning presentation",
        }],
    )
    model = StaticChatModel(["SELECT A1"])

    result = asyncio.run(
        CreatorActionSelector(model=model).select(
            "我需要把思考过程展示出来",
            context,
        )
    )

    assert result == CreatorActionSelection(
        decision="select_action",
        actionId="act_reasoning_add_default",
    )


@pytest.mark.parametrize("message", [
    "把会话管理放到 History 前面",
    "把会话管理放到主会话后面",
    "把会话管理放到上方",
    "把会话管理放到下方",
])
def test_explicit_relative_placement_cannot_fall_back_to_default(message):
    model = StaticChatModel(["SELECT A1"])

    selection = asyncio.run(
        CreatorActionSelector(model=model).select(message, _add_context(include_right=False))
    )

    assert selection.decision == "general_change"


def test_clarification_follow_up_carries_bounded_state_without_question_mark():
    store = PendingCreatorClarificationStore()
    store.replace(
        "thread-1",
        previous_user_request="我不要历史会话管理功能",
        clarification_question="你是只想移除界面上的历史会话管理面板，还是也要禁用底层能力",
    )
    pending = store.consume("thread-1")
    assert pending is not None
    context = pending.to_selector_context()
    assert context == {
        "previousUserRequest": "我不要历史会话管理功能",
        "previousCreatorClarification": "你是只想移除界面上的历史会话管理面板，还是也要禁用底层能力",
    }
    model = StaticChatModel(["SELECT A1"])
    remove_context = CreatorActionSelectorContext(
        catalogRevision="c" * 64,
        actions=[{
            "actionId": "act_remove", "kind": "remove_plugin", "status": "ready",
            "label": "Remove Conversation Thread List",
            "description": "Remove only the visual Plugin. Services and data remain.",
            "target": {"pluginId": "conversation-thread-list", "pluginName": "Conversation Thread List",
                       "instanceId": "conversation-thread-list-main"},
            "effect": {"type": "remove"},
        }],
        pluginSemantics=[],
    )
    selection = asyncio.run(CreatorActionSelector(model=model).select(
        "只去掉界面上的面板", remove_context, clarification_context=context,
    ))
    assert selection.actionId == "act_remove"
    assert _payload(model)["recentClarification"] == context


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


def test_selector_has_project_read_route_and_keeps_multistep_work_general():
    selection = _parse_selector_response("INSPECT", {})
    assert selection.decision == "read_only_analysis"
    assert "project-related read-only" in _SELECTOR_SYSTEM_PROMPT
    assert "related implementation steps" in _SELECTOR_SYSTEM_PROMPT
    assert "no matching atomic Action" in _SELECTOR_SYSTEM_PROMPT


@pytest.mark.parametrize("message", [
    "你能做什么？", "Creator 怎么用？", "我应该怎么描述需求？",
    "我可以让你先给方案再修改吗？",
])
def test_selector_answer_protocol_for_product_guidance(message):
    selector = CreatorActionSelector(model=StaticChatModel(["ANSWER"]))
    result = asyncio.run(selector.select(message, _context()))
    assert result.decision == "answer_only"
    assert _parse_selector_response("ANSWER", {}).decision == "answer_only"
    assert "ANSWER" in _SELECTOR_SYSTEM_PROMPT


@pytest.mark.parametrize("message", [
    "看看我现在有哪些插件", "为什么现在有两个 Footer？",
    "先根据当前工程给方案，不要修改",
])
def test_selector_keeps_workspace_questions_on_inspect(message):
    selector = CreatorActionSelector(model=StaticChatModel(["INSPECT"]))
    assert asyncio.run(selector.select(message, _context())).decision == "read_only_analysis"


def test_preserving_source_does_not_authorize_reverting_earlier_changes():
    assert "restore any source changed by an earlier turn" not in _SELECTOR_SYSTEM_PROMPT
    assert "preserve currently authorized source changes" in _SELECTOR_SYSTEM_PROMPT


def test_selector_keeps_atomic_disable_and_real_out_of_scope_routes():
    action = _unified_context().intentCatalog.candidates[0]
    selected = _parse_selector_response("SELECT A1", {"A1": action})
    unsupported = _parse_selector_response("UNSUPPORTED", {})
    assert selected.decision == "select_action"
    assert unsupported.decision == "unsupported_product_action"


def test_selector_accepts_already_satisfied_action():
    selector = CreatorActionSelector(model=StaticChatModel(["SELECT A1"]))
    result = asyncio.run(
        selector.select("把会话管理放最右边", _context(right_status="already_satisfied"))
    )
    assert result.actionId == "act_history_right"


def test_restoring_hidden_entry_does_not_accept_placement_only_action():
    selector = CreatorActionSelector(model=StaticChatModel(["SELECT A1"]))
    result = asyncio.run(
        selector.select(
            "把刚才隐藏的历史会话入口恢复到原来的右侧位置",
            _context(right_status="already_satisfied"),
        )
    )
    assert result.decision == "general_change"


def test_restoring_original_workspace_layout_does_not_accept_region_only_add():
    selector = CreatorActionSelector(model=StaticChatModel(["SELECT A2"]))
    result = asyncio.run(
        selector.select(
            "把之前隐藏的会话管理恢复到原来的右侧位置",
            _add_context(),
        )
    )
    assert result.decision == "general_change"


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
