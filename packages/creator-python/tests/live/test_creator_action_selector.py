from __future__ import annotations

import asyncio
import hashlib
import json
import os

import pytest

from agent_ui_creator.model_factory import create_creator_chat_model
from agent_ui_creator.model_settings import CreatorModelSettings
from agent_ui_creator.operations import (
    CreatorActionSelectionError,
    CreatorActionSelector,
    CreatorActionSelectorContext,
)


def _semantic_action_id(
    kind: str,
    subject: dict[str, str],
    effect: dict[str, str],
) -> str:
    identity = {"kind": kind, "subject": subject, "effect": effect}
    source = json.dumps(identity, ensure_ascii=False, separators=(",", ":"))
    return f"act_{hashlib.sha256(source.encode('utf-8')).hexdigest()[:24]}"


def _creator_action(
    *,
    action_id: str,
    kind: str,
    status: str,
    label: str,
    description: str,
    target: dict[str, str],
    effect: dict[str, str],
) -> dict[str, object]:
    return {
        "actionId": action_id,
        "kind": kind,
        "status": status,
        "label": label,
        "description": description,
        "target": target,
        "effect": effect,
    }


def _conversation_thread_list_context(
    *, mounted: bool,
) -> CreatorActionSelectorContext:
    thread_list_plugin = "conversation-thread-list"
    thread_list_instance = "conversation-thread-list-main"
    surface_plugin = "conversation-surface"
    surface_instance = "conversation-surface-main"
    thread_list_add_id = _semantic_action_id(
        "add_existing_plugin",
        {"pluginId": thread_list_plugin},
        {"type": "add_default"},
    )
    thread_list_remove_id = _semantic_action_id(
        "remove_plugin",
        {"pluginId": thread_list_plugin, "instanceId": thread_list_instance},
        {"type": "remove"},
    )
    thread_list_absent_remove_id = _semantic_action_id(
        "remove_plugin",
        {"pluginId": thread_list_plugin},
        {"type": "remove"},
    )
    surface_add_id = _semantic_action_id(
        "add_existing_plugin",
        {"pluginId": surface_plugin},
        {"type": "add_default"},
    )
    surface_remove_id = _semantic_action_id(
        "remove_plugin",
        {"pluginId": surface_plugin, "instanceId": surface_instance},
        {"type": "remove"},
    )
    surface_center_id = _semantic_action_id(
        "move_plugin",
        {"pluginId": surface_plugin, "instanceId": surface_instance},
        {"type": "workspace_region", "region": "center"},
    )

    thread_list_target = {
        "pluginId": thread_list_plugin,
        "pluginName": "Conversation Thread List",
    }
    surface_target = {
        "pluginId": surface_plugin,
        "pluginName": "Conversation Surface",
        "instanceId": surface_instance,
    }
    actions = [
        _creator_action(
            action_id=thread_list_add_id,
            kind="add_existing_plugin",
            status="already_satisfied" if mounted else "ready",
            label="Add Conversation Thread List",
            description=(
                "Add the existing Conversation Thread List Plugin using its default placement."
            ),
            target=(
                {**thread_list_target, "instanceId": thread_list_instance}
                if mounted
                else thread_list_target
            ),
            effect={"type": "add_default"},
        ),
        _creator_action(
            action_id=thread_list_remove_id if mounted else thread_list_absent_remove_id,
            kind="remove_plugin",
            status="ready" if mounted else "already_satisfied",
            label="Remove Conversation Thread List",
            description=(
                "Remove the Conversation Thread List Plugin instance from the current composition."
                if mounted
                else "Remove the Conversation Thread List Plugin from the current composition."
            ),
            target=(
                {**thread_list_target, "instanceId": thread_list_instance}
                if mounted
                else thread_list_target
            ),
            effect={"type": "remove"},
        ),
        _creator_action(
            action_id=surface_add_id,
            kind="add_existing_plugin",
            status="already_satisfied",
            label="Add Conversation Surface",
            description=(
                "Add the existing Conversation Surface Plugin using its default placement."
            ),
            target=surface_target,
            effect={"type": "add_default"},
        ),
        _creator_action(
            action_id=surface_remove_id,
            kind="remove_plugin",
            status="ready",
            label="Remove Conversation Surface",
            description=(
                "Remove the Conversation Surface Plugin instance from the current composition."
            ),
            target=surface_target,
            effect={"type": "remove"},
        ),
        _creator_action(
            action_id=surface_center_id,
            kind="move_plugin",
            status="already_satisfied",
            label="Move Conversation Surface to Workspace.Center",
            description=(
                "Move the Conversation Surface Plugin to the current Workspace.Center Region."
            ),
            target=surface_target,
            effect={"type": "workspace_region", "region": "center"},
        ),
    ]
    if mounted:
        thread_list_left_id = _semantic_action_id(
            "move_plugin",
            {"pluginId": thread_list_plugin, "instanceId": thread_list_instance},
            {"type": "workspace_region", "region": "left"},
        )
        actions.append(
            _creator_action(
                action_id=thread_list_left_id,
                kind="move_plugin",
                status="already_satisfied",
                label="Move Conversation Thread List to Workspace.Left",
                description=(
                    "Move the Conversation Thread List Plugin to the current Workspace.Left Region."
                ),
                target={**thread_list_target, "instanceId": thread_list_instance},
                effect={"type": "workspace_region", "region": "left"},
            )
        )

    return CreatorActionSelectorContext(
        catalogRevision="c" * 64,
        actions=actions,
        pluginSemantics=[
            {
                "pluginId": thread_list_plugin,
                "name": "Conversation Thread List",
                "description": (
                    "Uses the public Conversation thread list with AgentUICreator policy and data binding."
                ),
                "capabilities": [
                    "conversation-create",
                    "conversation-history",
                    "conversation-selection",
                    "plugin-service-consumer",
                ],
                "intents": [
                    "add conversation management",
                    "browse conversation history",
                    "select an existing conversation",
                    "start a new conversation",
                ],
                "visualRole": "conversation navigation",
            },
            {
                "pluginId": surface_plugin,
                "name": "Conversation Surface",
                "description": "组合 Live 与只读 History 会话的空状态、消息时间线与输入区。",
                "capabilities": ["conversation-surface"],
                "intents": ["show the primary live and historical conversation experience"],
                "visualRole": "primary conversation surface",
            },
        ],
    )


def _conversation_suggestions_context() -> CreatorActionSelectorContext:
    context = _conversation_thread_list_context(mounted=False)
    plugin_id = "conversation-suggestions"
    action_id = _semantic_action_id(
        "add_existing_plugin", {"pluginId": plugin_id}, {"type": "add_default"}
    )
    return CreatorActionSelectorContext(
        catalogRevision=context.catalogRevision,
        actions=[*context.actions, _creator_action(
            action_id=action_id,
            kind="add_existing_plugin",
            status="ready",
            label="Add Conversation Suggestions",
            description="Add starter prompts and suggested conversation actions using the Plugin default placement.",
            target={"pluginId": plugin_id, "pluginName": "Conversation Suggestions"},
            effect={"type": "add_default"},
        )],
        pluginSemantics=[*context.pluginSemantics, {
            "pluginId": plugin_id,
            "name": "Conversation Suggestions",
            "description": "Renders starter prompts through the Conversation public surface.",
            "capabilities": ["conversation-suggestions"],
            "intents": ["show starter prompts and suggested conversation actions"],
            "visualRole": "conversation empty-state suggestions",
        }],
    )


def _context() -> CreatorActionSelectorContext:
    return CreatorActionSelectorContext(
        catalogRevision="c" * 64,
        actions=[
            {
                "actionId": "act_history_right",
                "kind": "move_plugin",
                "status": "ready",
                "label": "Move History to Workspace.Right",
                "description": "Move the History Plugin to the semantic Workspace.Right Region.",
                "target": {
                    "pluginId": "history",
                    "pluginName": "History",
                    "instanceId": "history-main",
                },
                "effect": {"type": "workspace_region", "region": "right"},
            },
            {
                "actionId": "act_history_left",
                "kind": "move_plugin",
                "status": "ready",
                "label": "Move History to Workspace.Left",
                "description": "Move the History Plugin to the semantic Workspace.Left Region.",
                "target": {
                    "pluginId": "history",
                    "pluginName": "History",
                    "instanceId": "history-main",
                },
                "effect": {"type": "workspace_region", "region": "left"},
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
        ("把会话管理移到最左边", "act_history_left"),
        ("把会话管理移到最右边", "act_history_right"),
        ("把会话管理放到右边", "act_history_right"),
        ("把历史会话挪到最右侧", "act_history_right"),
        ("历史会话别放左边了，挪过去", "act_history_right"),
        ("把 History 放到这一行最后", "act_history_right"),
        ("把 History 放在 Conversation 后面", "act_history_right"),
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
    "prompt",
    [
        "我想要新增会话管理的功能",
        "新增会话管理",
        "添加会话管理",
        "加上历史会话",
        "我想看历史会话列表",
        "给我加一个会话列表",
    ],
)
def test_live_creator_action_selector_adds_conversation_thread_list(prompt):
    settings = CreatorModelSettings.from_environment()
    selector = CreatorActionSelector(
        model=create_creator_chat_model(settings),
        max_retries=settings.max_retries,
    )
    context = _conversation_thread_list_context(mounted=False)
    expected_action = context.actions[0].actionId

    result = asyncio.run(selector.select(prompt, context))

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
    "prompt",
    [
        "移除会话管理",
        "删除历史会话",
        "把会话列表删掉",
    ],
)
def test_live_creator_action_selector_removes_conversation_thread_list(prompt):
    settings = CreatorModelSettings.from_environment()
    selector = CreatorActionSelector(
        model=create_creator_chat_model(settings),
        max_retries=settings.max_retries,
    )
    context = _conversation_thread_list_context(mounted=True)
    expected_action = next(
        action.actionId
        for action in context.actions
        if action.kind == "remove_plugin"
        and action.target.pluginId == "conversation-thread-list"
        and action.target.instanceId == "conversation-thread-list-main"
    )

    result = asyncio.run(selector.select(prompt, context))

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
        ("把 History 放到中间", "unsupported_product_action"),
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


@pytest.mark.live_model
@pytest.mark.skipif(
    os.environ.get("CREATOR_RUN_LIVE_MODEL") != "1",
    reason="Set CREATOR_RUN_LIVE_MODEL=1 to run the live Action Selector evaluation pack.",
)
def test_live_creator_action_selector_selects_already_satisfied_action():
    settings = CreatorModelSettings.from_environment()
    selector = CreatorActionSelector(
        model=create_creator_chat_model(settings),
        max_retries=settings.max_retries,
    )
    context = _conversation_thread_list_context(mounted=True)

    result = asyncio.run(selector.select("新增会话管理", context))

    assert result.decision == "select_action"
    assert result.actionId == context.actions[0].actionId
    assert selector.metrics.modelCalls == 1
    assert selector.metrics.repairCalls == 0


@pytest.mark.live_model
@pytest.mark.skipif(
    os.environ.get("CREATOR_RUN_LIVE_MODEL") != "1",
    reason="Set CREATOR_RUN_LIVE_MODEL=1 to run the live Action Selector evaluation pack.",
)
def test_live_creator_action_selector_twenty_run_stability():
    settings = CreatorModelSettings.from_environment()
    observations = []
    for _ in range(20):
        selector = CreatorActionSelector(
            model=create_creator_chat_model(settings),
            max_retries=settings.max_retries,
        )
        context = _conversation_thread_list_context(mounted=False)
        try:
            result = asyncio.run(
                selector.select("我想要新增会话管理的功能", context)
            )
            decision = result.decision
            action_id = result.actionId
        except CreatorActionSelectionError:
            decision = "ACTION_SELECTION_FAILED"
            action_id = None
        observations.append(
            {
                "protocol": "choice-text-v1",
                "calls": selector.metrics.modelCalls,
                "repair": selector.metrics.repairCalls,
                "invalid": selector.metrics.invalidResponses,
                "reason": selector.metrics.repairReasonCode,
                "totalModelCalls": selector.metrics.modelCalls,
                "decision": decision,
                "selectedKind": (
                    "add_existing_plugin"
                    if action_id == context.actions[0].actionId
                    else None
                ),
            }
        )

    assert sum(row["calls"] == 1 and row["selectedKind"] == "add_existing_plugin" for row in observations) >= 19, observations
    assert all(row["selectedKind"] == "add_existing_plugin" for row in observations), observations
    assert sum(row["repair"] for row in observations) <= 1, observations


@pytest.mark.live_model
@pytest.mark.skipif(
    os.environ.get("CREATOR_RUN_LIVE_MODEL") != "1",
    reason="Set CREATOR_RUN_LIVE_MODEL=1 to run the live Action Selector evaluation pack.",
)
@pytest.mark.parametrize("request", [
    "添加示例提问",
    "我想给用户一些可以直接点的问题例子",
    "用户刚进来可能不知道能问什么，给他一些问题建议",
    "用户刚进来的时候他可能不知道能提什么问题，我想给他一些例子",
])
def test_live_creator_action_selector_identifies_suggestions_from_natural_language(request):
    settings = CreatorModelSettings.from_environment()
    selector = CreatorActionSelector(
        model=create_creator_chat_model(settings), max_retries=settings.max_retries,
    )
    context = _conversation_suggestions_context()
    result = asyncio.run(selector.select(request, context))
    expected = _semantic_action_id(
        "add_existing_plugin", {"pluginId": "conversation-suggestions"}, {"type": "add_default"}
    )
    assert result.decision == "select_action"
    assert result.actionId == expected
    assert selector.metrics.modelCalls == 1
