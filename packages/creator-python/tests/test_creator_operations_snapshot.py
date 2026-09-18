from __future__ import annotations

import asyncio
import copy

import pytest

from agent_ui_creator.operations import (
    CreatorDomainSnapshotError,
    CreatorDomainSnapshotProvider,
    MAX_PLUGIN_CAPABILITIES,
    MAX_PLUGIN_INSTANCES,
    MAX_PLUGIN_INTENTS,
    MAX_TOTAL_PLUGIN_INSTANCES,
)
from agent_ui_creator.project_control import ProjectControlError


OBSERVATION_COVERAGE = [
    "composition.model",
    "composition.layout",
    "composition.slots",
    "composition.instances",
    "capability.inventory",
    "capability.composition-summary",
]


def snapshot_result() -> dict[str, object]:
    return {
        "schemaVersion": 3,
        "view": "composition",
        "observationCoverage": OBSERVATION_COVERAGE,
        "appUIModel": {"hash": "a" * 64, "layout": {}, "slots": []},
        "pluginInstances": [],
        "capabilitySummaries": [
            {
                "pluginId": "conversation-thread-list",
                "name": "Conversation Thread List",
                "description": "Browse and select conversation history.",
                "selected": False,
                "authoring": {
                    "intents": [
                        "browse conversation history",
                        "select an existing conversation",
                    ],
                    "visualRole": "conversation navigation",
                    "typicalPlacement": {
                        "relation": "before",
                        "anchorPluginId": "conversation-surface",
                    },
                    "recommendedSize": {"width": "280px"},
                },
                "currentInstances": [],
                "requiredServices": {"status": "resolved"},
            },
            {
                "pluginId": "conversation-surface",
                "name": "Conversation Surface",
                "description": "Show and send conversation messages.",
                "selected": True,
                "authoring": {
                    "intents": ["show conversation", "send messages"],
                    "visualRole": "conversation surface",
                },
                "currentInstances": [
                    {
                        "instanceId": "conversation-surface-main",
                        "enabled": True,
                    }
                ],
            },
        ],
        "activeComposition": {
            "selectedPluginIds": ["conversation-surface"],
            "resolvedPluginIds": ["conversation-surface"],
            "headlessPluginIds": [],
        },
        "capabilityCatalogRevision": "b" * 64,
        "layoutConstraints": {},
        "hostGuarantees": {},
    }


class FakeProjectControl:
    def __init__(self, result: object) -> None:
        self.result = result
        self.views: list[str | None] = []

    async def inspect_ui_project(self, *, view=None):
        self.views.append(view)
        if isinstance(self.result, BaseException):
            raise self.result
        return self.result


def test_snapshot_provider_uses_one_authoritative_composition_read():
    client = FakeProjectControl(snapshot_result())

    snapshot = asyncio.run(CreatorDomainSnapshotProvider(client).build())

    assert client.views == ["composition"]
    assert snapshot.app_ui_model_hash == "a" * 64
    assert snapshot.plugin_index.plugins[0].pluginId == "conversation-surface"
    assert snapshot.resolver_context == {
        "plugins": [
            {
                "pluginId": "conversation-surface",
                "name": "Conversation Surface",
                "description": "Show and send conversation messages.",
                "intents": ["show conversation", "send messages"],
                "visualRole": "conversation surface",
                "selected": True,
                "instances": [
                    {"instanceId": "conversation-surface-main", "enabled": True}
                ],
            },
            {
                "pluginId": "conversation-thread-list",
                "name": "Conversation Thread List",
                "description": "Browse and select conversation history.",
                "intents": [
                    "browse conversation history",
                    "select an existing conversation",
                ],
                "visualRole": "conversation navigation",
                "selected": False,
                "instances": [],
                "defaultPlacement": {
                    "relation": "before",
                    "anchorPluginId": "conversation-surface",
                },
                "recommendedSize": {"width": "280px"},
                "requiredServices": {"status": "resolved"},
            },
        ]
    }


def test_snapshot_provider_fails_fast_on_project_control_failure():
    error = ProjectControlError(
        "CONTROL_PROTOCOL_INVALID_JSON", "synthetic control failure"
    )
    client = FakeProjectControl(error)
    provider = CreatorDomainSnapshotProvider(client)

    with pytest.raises(ProjectControlError) as raised:
        asyncio.run(provider.build())

    assert raised.value.code == "CONTROL_PROTOCOL_INVALID_JSON"
    assert provider.metrics.failures == 1


def test_snapshot_provider_rejects_incomplete_success_payload():
    client = FakeProjectControl({"view": "composition"})

    with pytest.raises(CreatorDomainSnapshotError) as raised:
        asyncio.run(CreatorDomainSnapshotProvider(client).build())

    assert raised.value.code == "DOMAIN_SNAPSHOT_INVALID"


def test_snapshot_provider_rejects_too_many_plugin_capabilities():
    result = snapshot_result()
    template = result["capabilitySummaries"][0]
    result["capabilitySummaries"] = [
        {**copy.deepcopy(template), "pluginId": f"plugin-{index}"}
        for index in range(MAX_PLUGIN_CAPABILITIES + 1)
    ]

    with pytest.raises(CreatorDomainSnapshotError) as raised:
        CreatorDomainSnapshotProvider._parse(result)

    assert raised.value.code == "DOMAIN_SNAPSHOT_TOO_LARGE"
    assert raised.value.details == {
        "field": "capabilitySummaries",
        "limit": MAX_PLUGIN_CAPABILITIES,
        "actual": MAX_PLUGIN_CAPABILITIES + 1,
    }


def test_snapshot_provider_rejects_too_many_plugin_intents():
    result = snapshot_result()
    result["capabilitySummaries"][0]["authoring"]["intents"] = [
        "intent"
    ] * (MAX_PLUGIN_INTENTS + 1)

    with pytest.raises(CreatorDomainSnapshotError) as raised:
        CreatorDomainSnapshotProvider._parse(result)

    assert raised.value.code == "DOMAIN_SNAPSHOT_TOO_LARGE"
    assert raised.value.details["limit"] == MAX_PLUGIN_INTENTS


def test_snapshot_provider_rejects_too_many_plugin_instances():
    result = snapshot_result()
    result["capabilitySummaries"][0]["currentInstances"] = [
        {"instanceId": f"instance-{index}", "enabled": True}
        for index in range(MAX_PLUGIN_INSTANCES + 1)
    ]

    with pytest.raises(CreatorDomainSnapshotError) as raised:
        CreatorDomainSnapshotProvider._parse(result)

    assert raised.value.code == "DOMAIN_SNAPSHOT_TOO_LARGE"
    assert raised.value.details["limit"] == MAX_PLUGIN_INSTANCES


def test_snapshot_provider_rejects_too_many_total_plugin_instances():
    result = snapshot_result()
    template = result["capabilitySummaries"][0]
    result["capabilitySummaries"] = [
        {
            **copy.deepcopy(template),
            "pluginId": f"plugin-{index}",
            "currentInstances": [
                {"instanceId": f"instance-{index}-{instance_index}", "enabled": True}
                for instance_index in range(MAX_PLUGIN_INSTANCES)
            ],
        }
        for index in range(
            MAX_TOTAL_PLUGIN_INSTANCES // MAX_PLUGIN_INSTANCES + 1
        )
    ]

    with pytest.raises(CreatorDomainSnapshotError) as raised:
        CreatorDomainSnapshotProvider._parse(result)

    assert raised.value.code == "DOMAIN_SNAPSHOT_TOO_LARGE"
    assert raised.value.details["limit"] == MAX_TOTAL_PLUGIN_INSTANCES
