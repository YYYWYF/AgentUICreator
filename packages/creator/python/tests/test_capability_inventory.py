from __future__ import annotations

import asyncio
import json

import pytest

from agent_ui_creator.domain_tools import create_operator_tools
from agent_ui_creator.operator import OperatorError


class InventoryClient:
    def __init__(self, *, fail_sources=False, item_count=1):
        self.fail_sources = fail_sources
        self.item_count = item_count
        self.source_reads = 0

    async def inspect_ui_project(self, *, view=None):
        return {"appUIModel": {"hash": "a" * 64}, "pluginAssets": [
            {"pluginId": "existing-plugin", "selected": False},
        ]}

    async def list_ui_plugins(self):
        project = await self.inspect_ui_project()
        return {**project, "appUIModelHash": "a" * 64}

    async def inspect_agent_ui_sources(self):
        self.source_reads += 1
        if self.fail_sources:
            raise OperatorError("REGISTRY_UNAVAILABLE", "registry unavailable")
        return {"stateHash": "b" * 64, "items": [
            {"id": f"plugin/tool-ui-{index}", "description": "Tool result UI",
             "status": "available", "owned": False, "updateAvailable": False}
            for index in range(self.item_count)
        ]}

    async def apply_agent_ui_source_item(self, **kwargs):
        raise AssertionError("Capability inspection must never install a plugin")


def inspect(client, name, *, include_official_inventory=True):
    tool = next(tool for tool in create_operator_tools(
        client, include_official_inventory=include_official_inventory,
    ) if tool.name == name)
    return json.loads(asyncio.run(tool.ainvoke({})))["result"]


@pytest.mark.parametrize("name", ["inspect_ui_capabilities", "inspect_ui_project", "list_ui_plugins"])
def test_read_inventory_includes_uninstalled_official_items_and_unselected_assets(name):
    client = InventoryClient()
    result = inspect(client, name)
    assert client.source_reads == 1
    assert result["sources"]["items"][0]["status"] == "available"
    assert result["sources"]["items"][0]["id"] == "plugin/tool-ui-0"
    assets = result["plugins"] if name == "inspect_ui_capabilities" else result["pluginAssets"]
    assert assets[0]["selected"] is False
    assert result["capabilityEvidence"]["absenceConclusionAllowed"] is True
    assert result["capabilityEvidence"]["officialSourceStateHash"] == "b" * 64


@pytest.mark.parametrize("name", ["inspect_ui_capabilities", "inspect_ui_project", "list_ui_plugins"])
def test_registry_failure_preserves_project_facts_and_prohibits_library_absence(name):
    result = inspect(InventoryClient(fail_sources=True), name)
    assert result["capabilityEvidence"]["installedProjectPluginsComplete"] is True
    assert result["capabilityEvidence"]["absenceConclusionAllowed"] is False
    assert result["sources"]["inventoryComplete"] is False
    assert "items" not in result["sources"]
    assert result["sources"]["error"]["code"] == "REGISTRY_UNAVAILABLE"


def test_missing_project_inventory_cannot_establish_absence():
    from agent_ui_creator.domain_tools.capabilities import capability_evidence

    evidence = capability_evidence({}, {"inventoryComplete": True})
    assert evidence["absenceConclusionAllowed"] is False


@pytest.mark.parametrize("name", ["inspect_ui_capabilities", "inspect_ui_project", "list_ui_plugins"])
def test_complete_empty_registry_is_distinct_from_failed_registry(name):
    result = inspect(InventoryClient(item_count=0), name)
    assert result["sources"]["items"] == []
    assert result["sources"]["inventoryComplete"] is True
    assert result["capabilityEvidence"]["absenceConclusionAllowed"] is True


def test_authoring_composition_path_does_not_fetch_official_inventory():
    client = InventoryClient()
    result = inspect(client, "list_ui_plugins", include_official_inventory=False)
    assert client.source_reads == 0
    assert "sources" not in result


def test_large_official_inventory_is_paged_without_losing_candidates():
    client = InventoryClient(item_count=500)
    tool = next(tool for tool in create_operator_tools(
        client, include_official_inventory=True,
    ) if tool.name == "list_ui_plugins")

    async def read_all():
        cursor = None
        parts = []
        hashes = set()
        while True:
            page = json.loads(await tool.ainvoke({"cursor": cursor}))["result"]
            hashes.add(page["snapshotHash"])
            parts.append(page["pageText"])
            cursor = page["nextCursor"]
            if cursor is None:
                assert page["pageComplete"] is True
                break
            assert page["pageComplete"] is False
        assert len(hashes) == 1
        assert len(parts) > 1
        return json.loads("".join(parts))["result"]

    result = asyncio.run(read_all())
    assert len(result["sources"]["items"]) == 500
    assert result["sources"]["items"][-1]["id"] == "plugin/tool-ui-499"


@pytest.mark.parametrize("name", ["inspect_ui_capabilities", "inspect_ui_project", "list_ui_plugins"])
def test_read_only_agent_delivers_official_candidates_even_through_legacy_tools(tmp_path, name):
    from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
    from langchain_core.messages import AIMessage, ToolMessage
    from agent_ui_creator.domain_agent import create_domain_read_creator_agent
    from agent_ui_creator.operator import OperatorClient

    class ReadingModel(FakeMessagesListChatModel):
        def bind_tools(self, tools, **kwargs):
            return self

        async def _agenerate(self, messages, **kwargs):
            for message in messages:
                if isinstance(message, ToolMessage) and message.name == name:
                    inventory = json.loads(message.content)["result"]
                    assert inventory["sources"]["items"][0]["id"] == "plugin/tool-ui-0"
                    object.__setattr__(self, "saw_official_inventory", True)
            return await super()._agenerate(messages, **kwargs)

    config = tmp_path / ".agent-ui" / "project.json"
    config.parent.mkdir()
    config.write_text(json.dumps({"mode": "platform", "sourceRoot": "src/agent-ui"}))
    stub = InventoryClient()
    client = OperatorClient(project_root=tmp_path)
    client.inspect_ui_project = stub.inspect_ui_project
    client.list_ui_plugins = stub.list_ui_plugins
    client.inspect_agent_ui_sources = stub.inspect_agent_ui_sources
    model = ReadingModel(responses=[
        AIMessage(content="", tool_calls=[{"name": name, "args": {}, "id": "inventory"}]),
        AIMessage(content="Official candidate found."),
    ])
    agent = create_domain_read_creator_agent(
        model=model, workspace=tmp_path, operator=client,
        permission_scope="inspect_read_only",
    )
    result = asyncio.run(agent.run("Do you have a tool result UI plugin?"))
    assert model.saw_official_inventory is True
    assert stub.source_reads == 1
    assert agent.activity.revision == 0
    assert result.text == "Official candidate found."
