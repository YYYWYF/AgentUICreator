from __future__ import annotations

import asyncio
import json

import pytest

from agent_ui_creator.operations import (
    CreatorOperationResolution,
    CreatorOperationResolutionError,
    CreatorOperationResolver,
    PluginCapabilityIndex,
)


def plugin_index() -> PluginCapabilityIndex:
    return PluginCapabilityIndex.model_validate(
        {
            "plugins": [
                {
                    "pluginId": "conversation-thread-list",
                    "name": "Conversation Thread List",
                    "description": "Browse conversation history.",
                    "intents": ["browse conversation history"],
                    "visualRole": "conversation navigation",
                    "selected": False,
                    "instances": [],
                },
                {
                    "pluginId": "conversation-surface",
                    "name": "Conversation Surface",
                    "description": "Show conversation.",
                    "intents": ["show conversation"],
                    "visualRole": "conversation surface",
                    "selected": True,
                    "instances": [
                        {
                            "instanceId": "conversation-surface-main",
                            "enabled": True,
                        }
                    ],
                },
            ]
        }
    )


class StaticStructuredModel:
    def __init__(self, responses):
        self.responses = list(responses)
        self.messages = []

    async def ainvoke(self, messages):
        self.messages.append(messages)
        return self.responses.pop(0)


def resolution(kind, *, plugins=None, instances=None, question=None):
    return CreatorOperationResolution(
        kind=kind,
        targetPluginIds=[] if plugins is None else plugins,
        targetInstanceIds=[] if instances is None else instances,
        clarificationQuestion=question,
    )


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        (
            "加回历史会话",
            resolution(
                "add_existing_plugin", plugins=["conversation-thread-list"]
            ),
        ),
        (
            "删除历史会话",
            resolution(
                "remove_plugin",
                plugins=["conversation-surface"],
                instances=["conversation-surface-main"],
            ),
        ),
        (
            "历史会话点击以后先显示 loading",
            resolution(
                "modify_plugin_logic", plugins=["conversation-thread-list"]
            ),
        ),
        (
            "把历史会话加到右边，320px",
            resolution("general_change"),
        ),
        (
            "删除那个会话相关的东西",
            resolution(
                "needs_clarification",
                question="你要删除历史会话，还是当前会话面板？",
            ),
        ),
    ],
)
def test_resolver_returns_host_validated_product_resolution(message, expected):
    model = StaticStructuredModel([expected])
    resolver = CreatorOperationResolver(structured_model=model)

    actual = asyncio.run(resolver.resolve(message, plugin_index()))

    assert actual == expected
    assert resolver.metrics.to_dict()["operationResolverCalls"] == 1
    assert len(model.messages) == 1
    prompt = json.loads(model.messages[0][1].content)
    assert prompt["userMessage"] == message
    assert prompt["pluginCapabilityIndex"]["plugins"]
    assert "inspect_ui_project" not in model.messages[0][0].content


def test_resolver_allows_one_bounded_repair_for_invalid_target():
    model = StaticStructuredModel(
        [
            {
                "kind": "add_existing_plugin",
                "targetPluginIds": ["missing-plugin"],
                "targetInstanceIds": [],
            },
            {
                "kind": "add_existing_plugin",
                "targetPluginIds": ["conversation-thread-list"],
                "targetInstanceIds": [],
            },
        ]
    )
    resolver = CreatorOperationResolver(structured_model=model)

    actual = asyncio.run(resolver.resolve("加回历史会话", plugin_index()))

    assert actual.kind == "add_existing_plugin"
    assert resolver.metrics.to_dict() == {
        "operationResolverCalls": 2,
        "operationResolverRepairCalls": 1,
        "operationResolverInvalidResponses": 1,
    }
    repair_prompt = json.loads(model.messages[1][1].content)
    assert "hostValidationFeedback" in repair_prompt
    assert repair_prompt["userMessage"] == "加回历史会话"


def test_resolver_does_not_retry_after_second_invalid_resolution():
    model = StaticStructuredModel(
        [
            {
                "kind": "add_existing_plugin",
                "targetPluginIds": ["missing-plugin"],
                "targetInstanceIds": [],
            },
            {
                "kind": "remove_plugin",
                "targetPluginIds": ["conversation-thread-list"],
                "targetInstanceIds": [],
            },
        ]
    )
    resolver = CreatorOperationResolver(structured_model=model)

    with pytest.raises(CreatorOperationResolutionError) as raised:
        asyncio.run(resolver.resolve("加回历史会话", plugin_index()))

    assert raised.value.code == "RESOLUTION_FAILED"
    assert resolver.metrics.modelCalls == 2
    assert len(model.messages) == 2
