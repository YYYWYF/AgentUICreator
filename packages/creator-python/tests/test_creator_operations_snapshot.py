from __future__ import annotations

import asyncio
import copy

import pytest

from agent_ui_creator.operations import (
    CreatorDomainSnapshotError,
    CreatorDomainSnapshotProvider,
    MAX_CHILD_SLOT_ACCEPTED_CAPABILITIES,
    MAX_CHILD_SLOT_DESCRIPTION_CHARS,
    MAX_CHILD_SLOT_NAME_CHARS,
    MAX_PLUGIN_ANCHOR_ID_CHARS,
    MAX_PLUGIN_AUTHORING_SIZE_CHARS,
    MAX_PLUGIN_CAPABILITY_CHARS,
    MAX_PLUGIN_CAPABILITY_TAGS,
    MAX_PLUGIN_CAPABILITIES,
    MAX_PLUGIN_CHILD_SLOTS,
    MAX_PLUGIN_DESCRIPTION_CHARS,
    MAX_PLUGIN_ID_CHARS,
    MAX_PLUGIN_INSTANCE_ID_CHARS,
    MAX_PLUGIN_INTENT_CHARS,
    MAX_PLUGIN_INSTANCES,
    MAX_PLUGIN_INTENTS,
    MAX_PLUGIN_NAME_CHARS,
    MAX_PLUGIN_VISUAL_ROLE_CHARS,
    MAX_REQUIRED_SERVICE_STATUS_CHARS,
    MAX_TOTAL_PLUGIN_CHILD_SLOTS,
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
                "capabilities": ["conversation-history"],
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
                "capabilities": ["conversation-surface"],
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
                "childSlots": {
                    "actions": {
                        "description": "Compact actions beside the composer input.",
                        "cardinality": "many",
                        "optional": True,
                        "accepts": {
                            "anyOfCapabilities": ["composer-action"]
                        },
                    }
                },
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
                "capabilities": ["conversation-surface"],
                "intents": ["show conversation", "send messages"],
                "visualRole": "conversation surface",
                "selected": True,
                "instances": [
                    {"instanceId": "conversation-surface-main", "enabled": True}
                ],
                "childSlots": [
                    {
                        "name": "actions",
                        "description": "Compact actions beside the composer input.",
                        "cardinality": "many",
                        "optional": True,
                        "acceptedCapabilities": ["composer-action"],
                    }
                ],
            },
            {
                "pluginId": "conversation-thread-list",
                "name": "Conversation Thread List",
                "description": "Browse and select conversation history.",
                "capabilities": ["conversation-history"],
                "intents": [
                    "browse conversation history",
                    "select an existing conversation",
                ],
                "visualRole": "conversation navigation",
                "selected": False,
                "instances": [],
                "childSlots": [],
                "defaultPlacement": {
                    "relation": "before",
                    "anchorPluginId": "conversation-surface",
                },
                "recommendedSize": {"width": "280px"},
                "requiredServices": {"status": "resolved"},
            },
        ]
    }


def test_snapshot_provider_projects_child_slot_contracts_and_plugin_capabilities():
    snapshot = CreatorDomainSnapshotProvider._parse(snapshot_result())

    surface = next(
        plugin
        for plugin in snapshot.plugin_index.plugins
        if plugin.pluginId == "conversation-surface"
    )
    assert surface.capabilities == ["conversation-surface"]
    assert surface.childSlots[0].model_dump(mode="json") == {
        "name": "actions",
        "description": "Compact actions beside the composer input.",
        "cardinality": "many",
        "optional": True,
        "acceptedCapabilities": ["composer-action"],
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


def test_snapshot_provider_rejects_too_many_plugin_capability_tags():
    result = snapshot_result()
    result["capabilitySummaries"][0]["capabilities"] = [
        f"capability-{index}" for index in range(MAX_PLUGIN_CAPABILITY_TAGS + 1)
    ]

    with pytest.raises(CreatorDomainSnapshotError) as raised:
        CreatorDomainSnapshotProvider._parse(result)

    assert raised.value.code == "DOMAIN_SNAPSHOT_TOO_LARGE"
    assert raised.value.details["limit"] == MAX_PLUGIN_CAPABILITY_TAGS


def test_snapshot_provider_rejects_child_slot_bounds():
    oversized_child_slots = snapshot_result()
    oversized_child_slots["capabilitySummaries"][0]["childSlots"] = {
        f"slot-{index}": {
            "description": "Child Slot",
            "cardinality": "many",
        }
        for index in range(MAX_PLUGIN_CHILD_SLOTS + 1)
    }
    with pytest.raises(CreatorDomainSnapshotError) as raised:
        CreatorDomainSnapshotProvider._parse(oversized_child_slots)
    assert raised.value.code == "DOMAIN_SNAPSHOT_TOO_LARGE"
    assert raised.value.details["limit"] == MAX_PLUGIN_CHILD_SLOTS

    oversized_name = snapshot_result()
    oversized_name["capabilitySummaries"][0]["childSlots"] = {
        "x" * (MAX_CHILD_SLOT_NAME_CHARS + 1): {
            "description": "Child Slot",
            "cardinality": "many",
        }
    }
    with pytest.raises(CreatorDomainSnapshotError) as raised:
        CreatorDomainSnapshotProvider._parse(oversized_name)
    assert raised.value.code == "DOMAIN_SNAPSHOT_TOO_LARGE"

    oversized_description = snapshot_result()
    oversized_description["capabilitySummaries"][0]["childSlots"] = {
        "actions": {
            "description": "x" * (MAX_CHILD_SLOT_DESCRIPTION_CHARS + 1),
            "cardinality": "many",
        }
    }
    with pytest.raises(CreatorDomainSnapshotError) as raised:
        CreatorDomainSnapshotProvider._parse(oversized_description)
    assert raised.value.code == "DOMAIN_SNAPSHOT_TOO_LARGE"

    oversized_accepts = snapshot_result()
    oversized_accepts["capabilitySummaries"][0]["childSlots"] = {
        "actions": {
            "description": "Child Slot",
            "cardinality": "many",
            "accepts": {
                "anyOfCapabilities": [
                    f"capability-{index}"
                    for index in range(MAX_CHILD_SLOT_ACCEPTED_CAPABILITIES + 1)
                ]
            },
        }
    }
    with pytest.raises(CreatorDomainSnapshotError) as raised:
        CreatorDomainSnapshotProvider._parse(oversized_accepts)
    assert raised.value.code == "DOMAIN_SNAPSHOT_TOO_LARGE"

    oversized_capability = snapshot_result()
    oversized_capability["capabilitySummaries"][0]["childSlots"] = {
        "actions": {
            "description": "Child Slot",
            "cardinality": "many",
            "accepts": {
                "anyOfCapabilities": ["x" * (MAX_PLUGIN_CAPABILITY_CHARS + 1)]
            },
        }
    }
    with pytest.raises(CreatorDomainSnapshotError) as raised:
        CreatorDomainSnapshotProvider._parse(oversized_capability)
    assert raised.value.code == "DOMAIN_SNAPSHOT_TOO_LARGE"


def test_snapshot_provider_rejects_too_many_total_child_slots():
    result = snapshot_result()
    template = result["capabilitySummaries"][0]
    result["capabilitySummaries"] = [
        {
            **copy.deepcopy(template),
            "pluginId": f"plugin-{index}",
            "childSlots": {
                f"slot-{slot_index}": {
                    "description": "Child Slot",
                    "cardinality": "many",
                }
                for slot_index in range(MAX_PLUGIN_CHILD_SLOTS)
            },
        }
        for index in range(
            MAX_TOTAL_PLUGIN_CHILD_SLOTS // MAX_PLUGIN_CHILD_SLOTS + 1
        )
    ]

    with pytest.raises(CreatorDomainSnapshotError) as raised:
        CreatorDomainSnapshotProvider._parse(result)

    assert raised.value.code == "DOMAIN_SNAPSHOT_TOO_LARGE"
    assert raised.value.details["limit"] == MAX_TOTAL_PLUGIN_CHILD_SLOTS


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


@pytest.mark.parametrize(
    "mutate",
    [
        lambda result: result["capabilitySummaries"][0].update(
            {"pluginId": "x" * (MAX_PLUGIN_ID_CHARS + 1)}
        ),
        lambda result: result["capabilitySummaries"][0].update(
            {"name": "x" * (MAX_PLUGIN_NAME_CHARS + 1)}
        ),
        lambda result: result["capabilitySummaries"][0].update(
            {"description": "x" * (MAX_PLUGIN_DESCRIPTION_CHARS + 1)}
        ),
        lambda result: result["capabilitySummaries"][0]["authoring"].update(
            {"intents": ["x" * (MAX_PLUGIN_INTENT_CHARS + 1)]}
        ),
        lambda result: result["capabilitySummaries"][0]["authoring"].update(
            {"visualRole": "x" * (MAX_PLUGIN_VISUAL_ROLE_CHARS + 1)}
        ),
        lambda result: result["capabilitySummaries"][0]["authoring"][
            "typicalPlacement"
        ].update({"anchorPluginId": "x" * (MAX_PLUGIN_ANCHOR_ID_CHARS + 1)}),
        lambda result: result["capabilitySummaries"][0]["authoring"].update(
            {
                "recommendedSize": {
                    "width": "x" * (MAX_PLUGIN_AUTHORING_SIZE_CHARS + 1)
                }
            }
        ),
        lambda result: result["capabilitySummaries"][0]["currentInstances"].append(
            {
                "instanceId": "x" * (MAX_PLUGIN_INSTANCE_ID_CHARS + 1),
                "enabled": True,
            }
        ),
        lambda result: result["capabilitySummaries"][0].update(
            {
                "requiredServices": {
                    "status": "x" * (MAX_REQUIRED_SERVICE_STATUS_CHARS + 1)
                }
            }
        ),
    ],
)
def test_snapshot_provider_rejects_oversized_resolver_strings(mutate):
    result = snapshot_result()
    mutate(result)

    with pytest.raises(CreatorDomainSnapshotError) as raised:
        CreatorDomainSnapshotProvider._parse(result)

    assert raised.value.code == "DOMAIN_SNAPSHOT_TOO_LARGE"
