from __future__ import annotations
import asyncio
import json
from agent_ui_creator.domain_tools import create_project_control_tools
from agent_ui_creator.domain_agent.tool_policy import ALLOWED_INSPECT_READ_ONLY_TOOLS, SIDE_EFFECT_TOOL_NAMES

class Client:
    def __init__(self):
        self.calls = []
    async def plan_agent_ui_integration(self, options):
        self.calls.append(("plan", options))
        return {"status": "target-required", "host": {"candidates": ["src/App.vue"]}}
    async def apply_agent_ui_integration(self, recipe):
        self.calls.append(("apply", recipe))
        return {"status": "passed", "changedPaths": []}
    async def prepare_agent_ui_integration_asset(self, recipe):
        self.calls.append(("prepare", recipe))
        return {"status": "ready", "target": "public/agent-ui.js", "changedPaths": []}
    async def verify_agent_ui_integration(self, recipe):
        self.calls.append(("verify", recipe))
        return {"status": "passed", "changedPaths": []}

def test_recipe_is_forwarded_unchanged_and_apply_is_unavailable_in_read_only_mode():
    client = Client()
    tools = {tool.name: tool for tool in create_project_control_tools(client)}
    recipe = {"id": "host-owned", "edits": []}
    for name, args in [("plan_agent_ui_integration", {}), ("apply_agent_ui_integration", {"recipe": recipe}), ("verify_agent_ui_integration", {"recipe": recipe})]:
        assert json.loads(asyncio.run(tools[name].ainvoke(args)))["ok"]
    assert client.calls == [("plan", {}), ("apply", recipe), ("verify", recipe)]
    assert "plan_agent_ui_integration" in ALLOWED_INSPECT_READ_ONLY_TOOLS
    assert "verify_agent_ui_integration" in ALLOWED_INSPECT_READ_ONLY_TOOLS
    assert "apply_agent_ui_integration" not in ALLOWED_INSPECT_READ_ONLY_TOOLS
    assert "apply_agent_ui_integration" in SIDE_EFFECT_TOOL_NAMES


def test_json_encoded_integration_arguments_are_decoded_without_changing_the_host_recipe():
    client = Client()
    tools = {tool.name: tool for tool in create_project_control_tools(client)}
    recipe = {"id": "host-owned", "edits": []}
    for name, args in [
        ("plan_agent_ui_integration", {"options": json.dumps({"targetFile": "src/App.vue"})}),
        ("apply_agent_ui_integration", {"recipe": json.dumps(recipe)}),
        ("verify_agent_ui_integration", {"recipe": json.dumps(recipe)}),
    ]:
        assert json.loads(asyncio.run(tools[name].ainvoke(args)))["ok"]
    assert client.calls == [("plan", {"targetFile": "src/App.vue"}), ("apply", recipe), ("verify", recipe)]


def test_asset_only_request_forwards_the_original_recipe_without_full_apply():
    client = Client()
    tools = {tool.name: tool for tool in create_project_control_tools(client)}
    recipe = {"id": "host-owned", "edits": [], "manualPrerequisites": [{"status": "missing"}]}
    result = json.loads(asyncio.run(tools["prepare_agent_ui_integration_asset"].ainvoke({"recipe": json.dumps(recipe)})))
    assert result["ok"]
    assert client.calls == [("prepare", recipe)]
    assert "prepare_agent_ui_integration_asset" in SIDE_EFFECT_TOOL_NAMES
    assert "prepare_agent_ui_integration_asset" not in ALLOWED_INSPECT_READ_ONLY_TOOLS
