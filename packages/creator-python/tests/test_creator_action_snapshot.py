from __future__ import annotations

import copy

import pytest

from agent_ui_creator.operations import (
    CreatorDomainSnapshotError,
    CreatorDomainSnapshotProvider,
    MAX_ACTION_DESCRIPTION_CHARS,
    MAX_ACTION_ID_CHARS,
    MAX_ACTION_LABEL_CHARS,
    MAX_CREATOR_ACTION_CANDIDATES,
)


OBSERVATION_COVERAGE = [
    "composition.model",
    "composition.layout",
    "composition.slots",
    "composition.instances",
    "capability.inventory",
    "capability.composition-summary",
    "creator.actions",
]


def _candidate(
    *,
    action_id: str = "act_history_right",
    kind: str = "move_plugin",
    status: str = "ready",
    target_plugin_id: str = "history",
    target_instance_id: str | None = "history-main",
    effect: dict[str, object] | None = None,
) -> dict[str, object]:
    return {
        "actionId": action_id,
        "kind": kind,
        "status": status,
        "label": "Move History to the current row's right edge",
        "description": "Move the History Plugin to the right edge of its current Row.",
        "target": {
            "pluginId": target_plugin_id,
            "pluginName": "History",
            **(
                {"instanceId": target_instance_id}
                if target_instance_id is not None
                else {}
            ),
        },
        "effect": effect or {"type": "row_edge", "edge": "right"},
    }


def snapshot_result(
    candidates: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    return {
        "schemaVersion": 3,
        "view": "composition",
        "observationCoverage": OBSERVATION_COVERAGE,
        "appUIModel": {"hash": "a" * 64, "layout": {}, "slots": []},
        "pluginInstances": [],
        "capabilitySummaries": [
            {
                "pluginId": "history",
                "name": "History",
                "description": "Browse conversation history.",
                "capabilities": ["conversation-history"],
                "selected": True,
                "authoring": {
                    "intents": ["browse conversation history"],
                    "visualRole": "conversation navigation",
                },
                "currentInstances": [
                    {"instanceId": "history-main", "enabled": True}
                ],
            },
            {
                "pluginId": "conversation",
                "name": "Conversation",
                "description": "Show conversation messages.",
                "capabilities": ["conversation-surface"],
                "selected": True,
                "authoring": {
                    "intents": ["show conversation"],
                    "visualRole": "conversation surface",
                },
                "currentInstances": [
                    {"instanceId": "conversation-main", "enabled": True}
                ],
            },
            {
                "pluginId": "theme",
                "name": "Theme Switch",
                "description": "Change the visual theme.",
                "capabilities": ["theme-control"],
                "selected": False,
                "currentInstances": [],
            },
        ],
        "activeComposition": {
            "selectedPluginIds": ["conversation", "history"],
            "resolvedPluginIds": ["conversation", "history"],
            "headlessPluginIds": [],
        },
        "capabilityCatalogRevision": "b" * 64,
        "creatorActions": {
            "revision": "c" * 64,
            "candidates": (
                [_candidate()]
                if candidates is None
                else candidates
            ),
        },
        "layoutConstraints": {},
        "hostGuarantees": {},
    }


def test_snapshot_projects_typed_action_catalog_and_compact_selector_context():
    result = snapshot_result(
        [
            _candidate(),
            _candidate(
                action_id="act_history_after_conversation",
                effect={
                    "type": "relative",
                    "anchorPluginId": "conversation",
                    "anchorPluginName": "Conversation",
                    "anchorInstanceId": "conversation-main",
                    "relation": "after",
                },
            ),
        ]
    )

    snapshot = CreatorDomainSnapshotProvider._parse(result)

    assert snapshot.action_catalog.revision == "c" * 64
    assert snapshot.action_catalog.candidates[0].effect.type == "row_edge"
    assert snapshot.action_selector_context == {
        "catalogRevision": "c" * 64,
        "actions": [
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
                "actionId": "act_history_after_conversation",
                "kind": "move_plugin",
                "status": "ready",
                "label": "Move History to the current row's right edge",
                "description": "Move the History Plugin to the right edge of its current Row.",
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
        ],
        "pluginSemantics": [
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
    }


@pytest.mark.parametrize(
    "mutate",
    [
        lambda result: result["creatorActions"]["candidates"].append(
            copy.deepcopy(result["creatorActions"]["candidates"][0])
        ),
        lambda result: result["creatorActions"]["candidates"][0].update(
            {"kind": "remove_plugin"}
        ),
        lambda result: result["creatorActions"]["candidates"][0]["target"].update(
            {"pluginId": "missing"}
        ),
        lambda result: result["creatorActions"]["candidates"][0]["target"].update(
            {"instanceId": "conversation-main"}
        ),
        lambda result: result["creatorActions"]["candidates"][0]["effect"].update(
            {
                "type": "relative",
                "anchorPluginId": "conversation",
                "anchorPluginName": "Conversation",
                "anchorInstanceId": "history-main",
                "relation": "after",
            }
        ),
        lambda result: result["creatorActions"]["candidates"][0].update(
            {
                "effect": {
                    "type": "plugin_slot",
                    "parentPluginId": "conversation",
                    "parentPluginName": "Conversation",
                    "parentInstanceId": "history-main",
                    "slot": "actions",
                }
            }
        ),
    ],
)
def test_snapshot_rejects_invalid_action_catalog_invariants(mutate):
    result = snapshot_result()
    mutate(result)

    with pytest.raises(CreatorDomainSnapshotError) as raised:
        CreatorDomainSnapshotProvider._parse(result)

    assert raised.value.code == "DOMAIN_SNAPSHOT_INVALID"


def test_snapshot_rejects_duplicate_action_ids():
    result = snapshot_result(
        [_candidate(), _candidate(action_id="act_history_right")]
    )

    with pytest.raises(CreatorDomainSnapshotError) as raised:
        CreatorDomainSnapshotProvider._parse(result)

    assert raised.value.code == "DOMAIN_SNAPSHOT_INVALID"


def test_snapshot_rejects_action_catalog_overflow_without_truncating():
    result = snapshot_result(
        [
            _candidate(action_id=f"act_{index}")
            for index in range(MAX_CREATOR_ACTION_CANDIDATES + 1)
        ]
    )

    with pytest.raises(CreatorDomainSnapshotError) as raised:
        CreatorDomainSnapshotProvider._parse(result)

    assert raised.value.code == "DOMAIN_SNAPSHOT_TOO_LARGE"
    assert raised.value.details == {
        "field": "creatorActions.candidates",
        "limit": MAX_CREATOR_ACTION_CANDIDATES,
        "actual": MAX_CREATOR_ACTION_CANDIDATES + 1,
    }


@pytest.mark.parametrize(
    ("field", "limit"),
    [
        ("actionId", MAX_ACTION_ID_CHARS),
        ("label", MAX_ACTION_LABEL_CHARS),
        ("description", MAX_ACTION_DESCRIPTION_CHARS),
    ],
)
def test_snapshot_rejects_oversized_action_strings(field, limit):
    result = snapshot_result()
    result["creatorActions"]["candidates"][0][field] = "x" * (limit + 1)

    with pytest.raises(CreatorDomainSnapshotError) as raised:
        CreatorDomainSnapshotProvider._parse(result)

    assert raised.value.code == "DOMAIN_SNAPSHOT_TOO_LARGE"
