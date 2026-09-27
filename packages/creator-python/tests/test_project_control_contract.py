from __future__ import annotations
import asyncio
import json
from typing import get_args

import pytest

from agent_ui_creator.app_ui_model.mutation_tool import create_app_ui_model_mutation_tool
from agent_ui_creator.domain_state import DomainObservationContext
from agent_ui_creator.domain_tools import create_project_control_tools
from agent_ui_creator.domain_agent.tool_policy import DOMAIN_WRITE_TOOL_NAMES
from agent_ui_creator.project_control import ProjectControlClient, ProjectControlError
from agent_ui_creator.project_control.models import ProjectControlOperation
from project_control_fixture_validation import ROOT, FIXTURES, canonical_fixture_outcomes


def _literal_names(binding):
    args = get_args(binding)
    return {value for arg in args for value in ([arg] if isinstance(arg, str) else _literal_names(arg))}


def test_inventory_and_actual_agent_tool_surface():
    inventory = json.loads((ROOT / "contracts/creator/project-control.operations.json").read_text())["operations"]
    names = {entry["name"] for entry in inventory}
    assert _literal_names(ProjectControlOperation) == names
    client = ProjectControlClient(project_root=ROOT)
    tools = (*create_project_control_tools(client), create_app_ui_model_mutation_tool(object(), DomainObservationContext()))
    assert {tool.name for tool in tools} & names == {entry["name"] for entry in inventory if entry["agentExposed"]}
    assert hasattr(client, "remove_agent_ui_source_items")
    assert "remove_agent_ui_source_items" not in DOMAIN_WRITE_TOOL_NAMES
    assert "remove_agent_ui_source_items" not in {tool.name for tool in tools}


def test_python_and_canonical_schema_accept_and_reject_the_same_fixtures():
    client = ProjectControlClient(project_root=ROOT)
    canonical = canonical_fixture_outcomes()
    manifest = json.loads((FIXTURES / "manifest.json").read_text())
    for kind, entries in manifest.items():
        for entry in entries:
            value = json.loads((FIXTURES / entry["file"]).read_text())
            try:
                if kind == "requests":
                    client._validate_protocol(value, request=True)
                else:
                    client._validate_result(entry["operation"], value)
                accepted = True
            except ProjectControlError as error:
                assert error.code == "CONTROL_PROTOCOL_INCOMPATIBLE"
                accepted = False
            assert accepted == canonical[entry["file"]] == entry["valid"], entry["file"]


def test_invalid_host_result_becomes_protocol_error_before_business_consumption(tmp_path, monkeypatch):
    client = ProjectControlClient(project_root=tmp_path)
    monkeypatch.setattr(client, "_ensure_fixed_runtime", lambda: None)

    async def execute(payload):
        return json.dumps({"schemaVersion": 3, "ok": True, "result": {
            "changed": True, "stateHashRenamed": "a" * 64,
        }}).encode(), b"", 0

    monkeypatch.setattr(client, "_execute", execute)
    with pytest.raises(ProjectControlError) as raised:
        asyncio.run(client.apply_agent_ui_source_item(item_id="primitive/tooltip", expected_state_hash="a" * 64))
    assert raised.value.code == "CONTROL_PROTOCOL_INCOMPATIBLE"
    assert raised.value.details["operation"] == "apply_agent_ui_source_item"
    assert "cause" in raised.value.details
