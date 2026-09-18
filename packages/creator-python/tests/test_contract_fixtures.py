from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError
from referencing import Registry, Resource

from agent_ui_creator.runtime_diagnostics import RuntimeDiagnosticEnvelope
from agent_ui_creator.server import AgUiRunInput

CONTRACTS_ROOT = Path(__file__).resolve().parents[3] / "contracts" / "creator"
SCHEMA_NAMES = (
    "creator-transport.schema.json",
    "project-control.schema.json",
    "app-ui-model-operation.schema.json",
    "creator-receipt.schema.json",
    "creator-host-results.schema.json",
)


def _json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


SCHEMAS = {name: _json(CONTRACTS_ROOT / name) for name in SCHEMA_NAMES}
REGISTRY = Registry().with_resources(
    (schema["$id"], Resource.from_contents(schema)) for schema in SCHEMAS.values()
)


def _fixture(name: str) -> dict[str, Any]:
    return _json(CONTRACTS_ROOT / "fixtures" / name)


def _validate(schema_name: str, value: Any) -> None:
    Draft202012Validator(SCHEMAS[schema_name], registry=REGISTRY).validate(value)


def test_transport_fixtures_match_json_schema_and_python_models():
    transport = _fixture("ag-ui-echo.json")
    diagnostics = _fixture("runtime-diagnostics.json")

    for value in (
        transport["handshake"],
        transport["health"],
        transport["request"],
        *transport["events"],
        diagnostics["diagnosticEnvelope"],
        diagnostics["compositionEnvelope"],
    ):
        _validate("creator-transport.schema.json", value)

    run_input = AgUiRunInput.model_validate(transport["request"])
    assert run_input.messages[-1]["content"] == "hello-python-sidecar-测试"
    assert [event["type"] for event in transport["events"]] == transport["eventTypes"]
    RuntimeDiagnosticEnvelope.model_validate(diagnostics["diagnosticEnvelope"])
    RuntimeDiagnosticEnvelope.model_validate(diagnostics["compositionEnvelope"])


def test_project_control_operation_receipt_and_host_fixtures_match_schemas():
    project_control = _fixture("project-control.json")
    host_results = _fixture("creator-host-results.json")

    for value in (
        project_control["request"],
        project_control["success"],
        project_control["failure"],
    ):
        _validate("project-control.schema.json", value)
    for operation in project_control["request"]["input"]["operations"]:
        _validate("app-ui-model-operation.schema.json", operation)
    _validate("creator-receipt.schema.json", host_results["receipt"])
    _validate("creator-host-results.schema.json", host_results["validation"])
    _validate("creator-host-results.schema.json", host_results["fastPath"])


def test_schema_version_drift_is_rejected():
    project_control = _fixture("project-control.json")
    drifted = {**project_control["request"], "schemaVersion": 999}

    with pytest.raises(ValidationError):
        _validate("project-control.schema.json", drifted)


def test_app_ui_remove_plugin_schema_accepts_explicit_reflow_mode():
    _validate(
        "app-ui-model-operation.schema.json",
        {
            "type": "remove_plugin",
            "instanceId": "history-main",
            "reflow": "collapse-empty-region",
        },
    )

    with pytest.raises(ValidationError):
        _validate(
            "app-ui-model-operation.schema.json",
            {
                "type": "remove_plugin",
                "instanceId": "history-main",
                "reflow": "guess-layout",
            },
        )


def test_creator_layout_track_sizes_require_explicit_css_strings():
    valid_relative = {
        "type": "insert_layout_relative",
        "anchorRef": "l1",
        "direction": "left",
        "node": {"type": "slot", "plugins": []},
        "size": "280px",
        "anchorSize": "minmax(0, 1fr)",
    }
    _validate("app-ui-model-operation.schema.json", valid_relative)

    # Panel dimensions continue to use the backwards-compatible layoutSize.
    _validate(
        "app-ui-model-operation.schema.json",
        {
            "type": "update_layout_node_props",
            "nodeRef": "l0",
            "set": {"width": 280, "height": "24rem"},
        },
    )

    invalid_operations = [
        {
            **valid_relative,
            "size": 280,
        },
        {
            "type": "insert_layout_node",
            "parentRef": "l0",
            "node": {
                "type": "row",
                "children": [],
                "sizes": [280, "1fr"],
            },
        },
        {
            "type": "update_layout_node_props",
            "nodeRef": "l0",
            "set": {"sizes": [280, "minmax(0, 1fr)"]},
        },
    ]
    for operation in invalid_operations:
        with pytest.raises(ValidationError):
            _validate("app-ui-model-operation.schema.json", operation)


def test_project_control_runtime_composition_accepts_bounded_geometry():
    app_hash = "a" * 64
    _validate(
        "project-control.schema.json",
        {
            "schemaVersion": 3,
            "operation": "verify_runtime_composition",
            "input": {
                "appUIModelHash": app_hash,
                "composition": {
                    "schemaVersion": 1,
                    "appUIModelHash": app_hash,
                    "compositionRevision": "revision-1",
                    "capabilityCatalogRevision": "b" * 64,
                    "publishedAt": "2026-09-17T00:00:00.000Z",
                    "observedAt": "2026-09-17T00:00:01.000Z",
                    "instances": [
                        {
                            "instanceId": "sidebar-main",
                            "pluginId": "conversation-thread-list",
                            "slotId": "sidebar.slot",
                            "rect": {
                                "x": 0,
                                "y": 0,
                                "width": 280,
                                "height": 800,
                            },
                        }
                    ],
                    "slots": [
                        {
                            "slotId": "sidebar.slot",
                            "widthClass": "narrow",
                            "rect": {
                                "x": 0,
                                "y": 0,
                                "width": 280,
                                "height": 800,
                            },
                        }
                    ],
                    "viewport": {"width": 1400, "height": 800},
                    "layoutNodes": [
                        {
                            "nodeId": "root-row",
                            "type": "row",
                            "rect": {
                                "x": 0,
                                "y": 0,
                                "width": 1400,
                                "height": 800,
                            },
                        }
                    ],
                },
            },
        },
    )


def test_targeted_layout_slot_inspection_requires_snapshot_hash():
    valid_layout_target = {
        "schemaVersion": 3,
        "operation": "inspect_ui_slots",
        "input": {
            "appUIModelHash": "a" * 64,
            "target": {"type": "layout_slot", "slotRef": "l2"},
        },
    }
    _validate("project-control.schema.json", valid_layout_target)

    with pytest.raises(ValidationError):
        _validate(
            "project-control.schema.json",
            {
                **valid_layout_target,
                "input": {"target": {"type": "layout_slot", "slotRef": "l2"}},
            },
        )

    _validate("project-control.schema.json", {
        "schemaVersion": 3,
        "operation": "inspect_ui_slots",
        "input": {
            "target": {
                "type": "plugin_slot",
                "parentInstanceId": "conversation-main",
                "slot": "emptySuggestions",
            },
        },
    })
