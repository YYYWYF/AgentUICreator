from __future__ import annotations

import asyncio
from pathlib import Path

from agent_ui_creator.project_control import ProjectControlClient

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
TARGET_PROJECT = REPOSITORY_ROOT / "examples" / "agent-frontend"


def test_real_target_project_read_operations_execute_through_tsx():
    client = ProjectControlClient(project_root=TARGET_PROJECT)

    project = asyncio.run(client.inspect_ui_project())
    app_ui_model = asyncio.run(client.inspect_app_ui_model())
    plugins = asyncio.run(client.list_ui_plugins())
    slots = asyncio.run(client.inspect_ui_slots())
    plugin_id = plugins["pluginAssets"][0]["pluginId"]
    plugin = asyncio.run(client.inspect_ui_plugin(plugin_id))
    references = asyncio.run(client.inspect_ui_plugin_source_references(plugin_id))

    assert project["schemaVersion"] == 2
    assert app_ui_model["hash"] == project["appUIModel"]["hash"]
    assert plugins["appUIModelHash"] == app_ui_model["hash"]
    assert slots["appUIModelHash"] == app_ui_model["hash"]
    assert plugin["asset"]["pluginId"] == plugin_id
    assert references["pluginId"] == plugin_id
