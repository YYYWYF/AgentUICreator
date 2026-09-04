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
