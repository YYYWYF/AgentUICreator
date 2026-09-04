from __future__ import annotations

import asyncio
import json
from agent_ui_creator.domain_tools import (
    DOMAIN_READ_TOOL_NAMES,
    MAX_DOMAIN_TOOL_RESULT_CHARS,
    create_project_control_tools,
)
from agent_ui_creator.project_control import ProjectControlError


class StubClient:
    async def inspect_ui_project(self):
        return {"project": True}

    async def inspect_app_ui_model(self):
        return {"model": True}

    async def list_ui_plugins(self):
        return {"plugins": []}

    async def inspect_ui_slots(self, *, root=None):
        return {"root": root}

    async def inspect_ui_plugin(self, plugin_id):
        return {"pluginId": plugin_id}

    async def inspect_ui_plugin_source_references(self, plugin_id):
        return {"pluginId": plugin_id, "entry": "definition.ts"}


def test_domain_tools_keep_ts_names_and_bounded_success_envelopes():
    tools = create_project_control_tools(StubClient())

    assert tuple(tool.name for tool in tools) == DOMAIN_READ_TOOL_NAMES
    result = json.loads(asyncio.run(tools[4].ainvoke({"pluginId": "workspace-inspector"})))
    assert result == {
        "ok": True,
        "result": {"pluginId": "workspace-inspector"},
    }


def test_domain_tool_preserves_project_control_error_code():
    client = StubClient()

    async def fail():
        raise ProjectControlError("CONTROL_ENTRY_TIMEOUT", "timed out", {"seconds": 15})

    client.inspect_ui_project = fail
    tool = create_project_control_tools(client)[0]

    result = json.loads(asyncio.run(tool.ainvoke({})))
    assert result["error"]["code"] == "CONTROL_ENTRY_TIMEOUT"


def test_domain_tool_rejects_oversized_result_without_truncating_json():
    client = StubClient()

    async def huge():
        return {"source": "x" * (MAX_DOMAIN_TOOL_RESULT_CHARS + 1)}

    client.inspect_ui_project = huge
    tool = create_project_control_tools(client)[0]

    rendered = asyncio.run(tool.ainvoke({}))
    result = json.loads(rendered)
    assert len(rendered) < MAX_DOMAIN_TOOL_RESULT_CHARS
    assert result["error"]["code"] == "PROJECT_CONTROL_RESULT_TOO_LARGE"
