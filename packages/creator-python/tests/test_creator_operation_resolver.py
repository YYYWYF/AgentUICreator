from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from agent_ui_creator.operations import (
    CreatorOperationResolution,
    CreatorOperationResolutionError,
    CreatorOperationResolver,
    MAX_PLUGIN_ANCHOR_ID_CHARS,
    MAX_PLUGIN_AUTHORING_SIZE_CHARS,
    MAX_PLUGIN_CAPABILITIES,
    MAX_PLUGIN_DESCRIPTION_CHARS,
    MAX_PLUGIN_ID_CHARS,
    MAX_PLUGIN_INSTANCE_ID_CHARS,
    MAX_PLUGIN_INTENT_CHARS,
    MAX_PLUGIN_NAME_CHARS,
    MAX_PLUGIN_VISUAL_ROLE_CHARS,
    MAX_REQUIRED_SERVICE_STATUS_CHARS,
    PluginCapabilityIndex,
)


def _plugin_index(
    *,
    thread_selected: bool,
    thread_instances: list[dict[str, object]],
) -> PluginCapabilityIndex:
    return PluginCapabilityIndex.model_validate(
        {
            "plugins": [
                {
                    "pluginId": "conversation-thread-list",
                    "name": "Conversation Thread List",
                    "description": "Browse conversation history.",
                    "intents": ["browse conversation history"],
                    "visualRole": "conversation navigation",
                    "selected": thread_selected,
                    "instances": thread_instances,
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


def add_plugin_index() -> PluginCapabilityIndex:
    return _plugin_index(thread_selected=False, thread_instances=[])


def remove_plugin_index() -> PluginCapabilityIndex:
    return _plugin_index(
        thread_selected=True,
        thread_instances=[
            {
                "instanceId": "conversation-thread-list-main",
                "enabled": True,
            }
        ],
    )


class StaticStructuredModel:
    def __init__(self, responses):
        self.responses = list(responses)
        self.messages = []

    async def ainvoke(self, messages):
        self.messages.append(messages)
        result = self.responses.pop(0)
        if isinstance(result, BaseException):
            raise result
        return result


def resolution(kind, *, plugins=None, instances=None, question=None):
    return CreatorOperationResolution(
        kind=kind,
        targetPluginIds=[] if plugins is None else plugins,
        targetInstanceIds=[] if instances is None else instances,
        clarificationQuestion=question,
    )


@pytest.mark.parametrize(
    ("message", "index_factory", "expected"),
    [
        (
            "加回历史会话",
            add_plugin_index,
            resolution(
                "add_existing_plugin", plugins=["conversation-thread-list"]
            ),
        ),
        (
            "删除历史会话",
            remove_plugin_index,
            resolution(
                "remove_plugin",
                plugins=["conversation-thread-list"],
                instances=["conversation-thread-list-main"],
            ),
        ),
        (
            "历史会话点击以后先显示 loading",
            add_plugin_index,
            resolution(
                "modify_plugin_logic", plugins=["conversation-thread-list"]
            ),
        ),
        (
            "把历史会话加到右边，320px",
            add_plugin_index,
            resolution("general_change"),
        ),
        (
            "删除那个会话相关的东西",
            add_plugin_index,
            resolution(
                "needs_clarification",
                question="你要删除历史会话，还是当前会话面板？",
            ),
        ),
    ],
)
def test_resolver_returns_host_validated_product_resolution(
    message, index_factory, expected
):
    model = StaticStructuredModel([expected])
    resolver = CreatorOperationResolver(structured_model=model)

    actual = asyncio.run(resolver.resolve(message, index_factory()))

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

    actual = asyncio.run(resolver.resolve("加回历史会话", add_plugin_index()))

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
        asyncio.run(resolver.resolve("加回历史会话", add_plugin_index()))

    assert raised.value.code == "RESOLUTION_FAILED"
    assert resolver.metrics.modelCalls == 2
    assert len(model.messages) == 2


def _connect_error() -> httpx.ConnectError:
    request = httpx.Request("POST", "https://model.example/v1/chat/completions")
    return httpx.ConnectError("synthetic connect failure", request=request)


def _remote_protocol_error() -> httpx.RemoteProtocolError:
    request = httpx.Request("POST", "https://model.example/v1/chat/completions")
    return httpx.RemoteProtocolError("synthetic incomplete stream", request=request)


def test_resolver_retries_connect_error_then_returns_resolution(monkeypatch):
    async def no_sleep(_delay):
        return None

    monkeypatch.setattr(
        "agent_ui_creator.model_protocol.reliability.asyncio.sleep", no_sleep
    )
    expected = resolution(
        "add_existing_plugin", plugins=["conversation-thread-list"]
    )
    model = StaticStructuredModel([_connect_error(), expected])
    resolver = CreatorOperationResolver(structured_model=model)

    actual = asyncio.run(resolver.resolve("加回历史会话", add_plugin_index()))

    assert actual == expected
    assert len(model.messages) == 2
    assert resolver.metrics.modelCalls == 1


def test_resolver_remote_protocol_error_uses_fresh_structured_model(
    monkeypatch,
):
    async def no_sleep(_delay):
        return None

    monkeypatch.setattr(
        "agent_ui_creator.model_protocol.reliability.asyncio.sleep", no_sleep
    )
    expected = resolution(
        "remove_plugin",
        plugins=["conversation-thread-list"],
        instances=["conversation-thread-list-main"],
    )
    old_model = StaticStructuredModel([_remote_protocol_error()])
    fresh_model = StaticStructuredModel([expected])
    resolver = CreatorOperationResolver(
        structured_model=old_model,
        recovery_factory=lambda: fresh_model,
    )

    actual = asyncio.run(resolver.resolve("删除历史会话", remove_plugin_index()))

    assert actual == expected
    assert len(old_model.messages) == 1
    assert len(fresh_model.messages) == 1


def test_resolver_rejects_oversized_plugin_index_before_model_call():
    model = StaticStructuredModel([])
    resolver = CreatorOperationResolver(structured_model=model)
    context = add_plugin_index().model_dump(mode="json")
    template = context["plugins"][0]
    context["plugins"] = [
        {**template, "pluginId": f"plugin-{index}"}
        for index in range(MAX_PLUGIN_CAPABILITIES + 1)
    ]

    with pytest.raises(CreatorOperationResolutionError):
        asyncio.run(resolver.resolve("加回历史会话", context))

    assert model.messages == []


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("pluginId", "x" * (MAX_PLUGIN_ID_CHARS + 1)),
        ("name", "x" * (MAX_PLUGIN_NAME_CHARS + 1)),
        ("description", "x" * (MAX_PLUGIN_DESCRIPTION_CHARS + 1)),
        ("intent", "x" * (MAX_PLUGIN_INTENT_CHARS + 1)),
        ("visualRole", "x" * (MAX_PLUGIN_VISUAL_ROLE_CHARS + 1)),
        ("anchorPluginId", "x" * (MAX_PLUGIN_ANCHOR_ID_CHARS + 1)),
        ("recommendedSize", "x" * (MAX_PLUGIN_AUTHORING_SIZE_CHARS + 1)),
        ("requiredServiceStatus", "x" * (MAX_REQUIRED_SERVICE_STATUS_CHARS + 1)),
        ("instanceId", "x" * (MAX_PLUGIN_INSTANCE_ID_CHARS + 1)),
    ],
)
def test_resolver_rejects_oversized_context_strings_before_model_call(field, value):
    model = StaticStructuredModel([])
    resolver = CreatorOperationResolver(structured_model=model)
    context = add_plugin_index().model_dump(mode="json")

    if field == "instanceId":
        context["plugins"][1]["instances"][0]["instanceId"] = value
    elif field == "anchorPluginId":
        context["plugins"][0]["defaultPlacement"] = {
            "relation": "before",
            "anchorPluginId": value,
        }
    elif field == "recommendedSize":
        context["plugins"][0]["recommendedSize"] = {"width": value}
    elif field == "requiredServiceStatus":
        context["plugins"][0]["requiredServices"] = {"status": value}
    elif field == "intent":
        context["plugins"][0]["intents"] = [value]
    else:
        context["plugins"][0][field] = value

    with pytest.raises(CreatorOperationResolutionError):
        asyncio.run(resolver.resolve("加回历史会话", context))

    assert model.messages == []


def test_plugin_capability_index_accepts_exact_string_bounds():
    index = PluginCapabilityIndex.model_validate(
        {
            "plugins": [
                {
                    "pluginId": "p" * MAX_PLUGIN_ID_CHARS,
                    "name": "n" * MAX_PLUGIN_NAME_CHARS,
                    "description": "d" * MAX_PLUGIN_DESCRIPTION_CHARS,
                    "intents": ["i" * MAX_PLUGIN_INTENT_CHARS],
                    "visualRole": "v" * MAX_PLUGIN_VISUAL_ROLE_CHARS,
                    "selected": True,
                    "instances": [
                        {
                            "instanceId": "i" * MAX_PLUGIN_INSTANCE_ID_CHARS,
                            "enabled": True,
                        }
                    ],
                    "defaultPlacement": {
                        "relation": "before",
                        "anchorPluginId": "a" * MAX_PLUGIN_ANCHOR_ID_CHARS,
                    },
                    "recommendedSize": {
                        "width": "w" * MAX_PLUGIN_AUTHORING_SIZE_CHARS,
                        "height": "h" * MAX_PLUGIN_AUTHORING_SIZE_CHARS,
                    },
                    "requiredServices": {
                        "status": "s" * MAX_REQUIRED_SERVICE_STATUS_CHARS
                    },
                }
            ]
        }
    )

    assert len(index.plugins[0].pluginId) == MAX_PLUGIN_ID_CHARS
