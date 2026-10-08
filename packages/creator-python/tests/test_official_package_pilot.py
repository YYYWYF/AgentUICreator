from __future__ import annotations
import asyncio
import json
from agent_ui_creator.domain_agent.prompt import DOMAIN_WRITE_AGENT_PROMPT
from agent_ui_creator.domain_agent.tool_policy import SIDE_EFFECT_TOOL_NAMES
from agent_ui_creator.domain_tools import create_project_control_tools
from agent_ui_creator.operations import (
    CreatorActionCatalogSnapshot, CreatorAuthoringTargetBinding,
    CreatorAuthoringTargetCandidate, CreatorAuthoringTargetCatalogSnapshot,
    CreatorDomainSnapshot, CreatorActionSelector, CreatorActionSelectorContext,
    PluginCapabilityIndex,
)
from test_creator_action_selector import StaticChatModel


def test_natural_language_custom_composer_routes_to_reference_without_write_binding():
    target = CreatorAuthoringTargetCandidate(
        targetId="official-plugin-reference:assistant-ui-composer",
        kind="official_plugin_reference", name="Official Composer",
        description="Dependency-owned; inspect Slots and public APIs, then create_custom_plugin.",
        intents=["customize composer"], relatedPluginIds=["assistant-ui-composer"],
    )
    snapshot = CreatorDomainSnapshot(raw={}, app_ui_model_hash="a" * 64,
        capability_catalog_revision="b" * 64, observation_coverage=(),
        plugin_index=PluginCapabilityIndex(),
        action_catalog=CreatorActionCatalogSnapshot(revision="c" * 64, candidates=[]),
        authoring_target_catalog=CreatorAuthoringTargetCatalogSnapshot(revision="d" * 64,
            candidates=[target], bindings=[CreatorAuthoringTargetBinding(
                targetId=target.targetId, kind=target.kind, pluginId="assistant-ui-composer",
                relatedPluginIds=["assistant-ui-composer"],
            )]),
    )
    selector = CreatorActionSelector(model=StaticChatModel(["MODIFY SELECT A1"]))
    selection = asyncio.run(selector.select("把输入框改成我们自己的，发送按钮旁边加一个业务按钮。",
        CreatorActionSelectorContext.model_validate(snapshot.action_selector_context)))
    assert selection.targetId == target.targetId
    handoff = snapshot.authoring_handoff(target.targetId)
    assert handoff.kind == "official_plugin_reference"
    assert handoff.ownerRoot is None and handoff.definitionPath is None
    assert "create_custom_plugin" in DOMAIN_WRITE_AGENT_PROMPT
    assert "Never edit node_modules" in DOMAIN_WRITE_AGENT_PROMPT


def test_custom_creation_tool_forwards_semantic_input_and_classifies_mutation():
    class Client:
        async def create_custom_plugin(self, **input):
            assert input == {"pluginId": "company-composer", "basedOn": "assistant-ui-composer",
                "replaceInstanceId": "composer-main"}
            return {"pluginId": "company-composer", "ownership": "project_source",
                "checks": ["build"], "changedPaths": []}
    tool = next(tool for tool in create_project_control_tools(Client()) if tool.name == "create_custom_plugin")
    result = json.loads(asyncio.run(tool.ainvoke({"pluginId": "company-composer",
        "basedOn": "assistant-ui-composer", "replaceInstanceId": "composer-main"})))
    assert result["ok"] and result["result"]["ownership"] == "project_source"
    assert tool.name in SIDE_EFFECT_TOOL_NAMES


def test_host_resolved_official_customization_authorizes_derivation_without_new_approval(tmp_path):
    import pytest
    from agent_ui_creator.plugin_development.authority import PluginDevelopmentAuthority, PluginDevelopmentError
    from agent_ui_creator.plugin_development.admission_middleware import PluginDevelopmentAdmissionMiddleware
    authority = PluginDevelopmentAuthority(tmp_path, thread_id="pilot")
    args = {"pluginId": "company-composer", "basedOn": "assistant-ui-composer", "replaceInstanceId": "composer-main"}
    with pytest.raises(PluginDevelopmentError):
        PluginDevelopmentAdmissionMiddleware(authority)._admit("create_custom_plugin", args)
    middleware = PluginDevelopmentAdmissionMiddleware(authority, official_reference_plugin_id="assistant-ui-composer")
    middleware._admit("create_custom_plugin", args)
    with pytest.raises(PluginDevelopmentError):
        middleware._admit("mutate_ui_plugin_source", {"pluginId": "assistant-ui-composer"})
