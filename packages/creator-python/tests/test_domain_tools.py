from __future__ import annotations

import asyncio
import json
from agent_ui_creator.domain_tools import (
    DOMAIN_READ_TOOL_NAMES,
    MAX_DOMAIN_TOOL_RESULT_CHARS,
    create_project_control_tools,
)
from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.domain_state import DomainObservationContext
from agent_ui_creator.project_control import ProjectControlError


class StubClient:
    async def inspect_ui_project(self):
        return {"project": True, "appUIModel": {"hash": "a" * 64}}

    async def inspect_app_ui_model(self):
        return {"schemaVersion": 2, "hash": "b" * 64, "model": {}}

    async def list_ui_plugins(self):
        return {"plugins": [], "appUIModelHash": "c" * 64}

    async def inspect_ui_slots(self, *, root=None):
        return {"root": root, "appUIModelHash": "d" * 64}

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


def test_authoritative_domain_reads_update_shared_observation(tmp_path):
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("domain-reads")
    observations = DomainObservationContext()
    tools = create_project_control_tools(
        StubClient(),
        observations=observations,
        activity=activity,
    )

    for index, expected_hash, expected_source in (
        (0, "a" * 64, "inspect_ui_project"),
        (1, "b" * 64, "inspect_app_ui_model"),
        (2, "c" * 64, "list_ui_plugins"),
        (3, "d" * 64, "inspect_ui_slots"),
    ):
        asyncio.run(tools[index].ainvoke({}))
        snapshot = observations.snapshot()["appUIModel"]
        assert snapshot == {
            "hash": expected_hash,
            "revision": 0,
            "source": expected_source,
        }


def test_failed_inspection_preserves_existing_observation(tmp_path):
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("failed-read")
    observations = DomainObservationContext()
    client = StubClient()
    tools = create_project_control_tools(
        client,
        observations=observations,
        activity=activity,
    )
    asyncio.run(tools[0].ainvoke({}))

    async def fail():
        raise ProjectControlError("CONTROL_ENTRY_TIMEOUT", "timed out")

    client.inspect_ui_project = fail
    asyncio.run(tools[0].ainvoke({}))

    assert observations.current_hash(current_revision=0) == "a" * 64
