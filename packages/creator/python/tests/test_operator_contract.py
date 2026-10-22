from __future__ import annotations
import asyncio
import json
from typing import get_args

import pytest

from agent_ui_creator.app_ui_model.recovery_tool import create_app_ui_model_recovery_tool
from agent_ui_creator.app_ui_model.mutation_tool import create_app_ui_model_mutation_tool
from agent_ui_creator.domain_state import DomainObservationContext
from agent_ui_creator.domain_tools import create_operator_tools
from agent_ui_creator.domain_agent.tool_policy import DOMAIN_WRITE_TOOL_NAMES
from agent_ui_creator.operator import OperatorClient, OperatorError
from agent_ui_creator.operator.models import OperatorOperation
from operator_fixture_validation import ROOT, FIXTURES, canonical_fixture_outcomes


def _literal_names(binding):
    args = get_args(binding)
    return {value for arg in args for value in ([arg] if isinstance(arg, str) else _literal_names(arg))}


def test_inventory_and_actual_agent_tool_surface():
    inventory = json.loads((ROOT / "packages/creator/contracts/creator/operator.operations.json").read_text())["operations"]
    names = {entry["name"] for entry in inventory}
    assert _literal_names(OperatorOperation) == names
    client = OperatorClient(project_root=ROOT)
    tools = (*create_operator_tools(client), create_app_ui_model_mutation_tool(object(), DomainObservationContext()), create_app_ui_model_recovery_tool(object(), DomainObservationContext()))
    assert {tool.name for tool in tools} & names == {entry["name"] for entry in inventory if entry["agentExposed"]}
    assert hasattr(client, "remove_agent_ui_source_items")
    assert "remove_agent_ui_source_items" not in DOMAIN_WRITE_TOOL_NAMES
    assert "remove_agent_ui_source_items" not in {tool.name for tool in tools}


def test_python_and_canonical_schema_accept_and_reject_the_same_fixtures():
    client = OperatorClient(project_root=ROOT)
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
            except OperatorError as error:
                assert error.code == "OPERATOR_PROTOCOL_INCOMPATIBLE"
                accepted = False
            assert accepted == canonical[entry["file"]] == entry["valid"], entry["file"]


def test_invalid_host_result_becomes_protocol_error_before_business_consumption(tmp_path, monkeypatch):
    client = OperatorClient(project_root=tmp_path)
    monkeypatch.setattr(client, "_ensure_fixed_runtime", lambda: None)

    async def execute(payload):
        return json.dumps({"ok": True, "result": {
            "changed": True, "stateHashRenamed": "a" * 64,
        }}).encode(), b"", 0

    monkeypatch.setattr(client, "_execute", execute)
    with pytest.raises(OperatorError) as raised:
        asyncio.run(client.apply_agent_ui_source_item(item_id="primitive/tooltip", expected_state_hash="a" * 64))
    assert raised.value.code == "OPERATOR_PROTOCOL_INCOMPATIBLE"
    assert raised.value.details["operation"] == "apply_agent_ui_source_item"
    assert "cause" in raised.value.details


def test_purge_contract_accepts_only_plugin_identity_and_fresh_hashes():
    client = OperatorClient(project_root=ROOT)
    request = {"operation": "purge_ui_plugin", "input": {
        "pluginId": "slash-command-trigger",
        "appUIModelHash": "a" * 64, "sourceStateHash": "b" * 64,
    }}
    client._validate_protocol(request, request=True)
    with pytest.raises(OperatorError):
        client._validate_protocol({**request, "input": {**request["input"], "files": ["plugins/any/file.ts"]}}, request=True)


def test_full_inspection_accepts_typed_ui_context_and_rejects_invalid_facts():
    import copy
    client = OperatorClient(project_root=ROOT)
    result = json.loads((FIXTURES / 'inspect_ui_project.result.json').read_text())
    result['uiContext'] = {
        'authority': 'package declarations only; inspect actual components, imports, providers and styles before selecting a UI system',
        'manifestPath': 'package.json',
        'dependencyDeclarations': [{'packageName': '@host/ui', 'version': 'workspace:*', 'section': 'dependencies'}],
        'packageManager': 'npm@11.0.0', 'scriptNames': ['verify:ui', 'typecheck', 'build'],
    }
    client._validate_result('inspect_ui_project', result)
    for bad in [
        {**result['uiContext'], 'selectedLibrary': 'antd'},
        {**result['uiContext'], 'dependencyDeclarations': [{'packageName': 'antd', 'version': '^5', 'section': 'invented'}]},
        {**result['uiContext'], 'scriptNames': [42]},
    ]:
        candidate = copy.deepcopy(result)
        candidate['uiContext'] = bad
        with pytest.raises(OperatorError):
            client._validate_result('inspect_ui_project', candidate)
