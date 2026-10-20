from __future__ import annotations

import asyncio
import json
import pytest
from agent_ui_creator.domain_tools import (
    DOMAIN_READ_TOOL_NAMES,
    MAX_DOMAIN_TOOL_RESULT_CHARS,
    create_operator_tools,
)
from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.domain_state import DomainObservationContext
from agent_ui_creator.domain_state import DomainObservationError
from agent_ui_creator.operator import OperatorError
from agent_ui_creator.domain_agent.prompt import DOMAIN_READ_AGENT_PROMPT, DOMAIN_WRITE_AGENT_PROMPT
from agent_ui_creator.app_ui_model.mutation_tool import create_app_ui_model_mutation_tool


def _tool(tools, name):
    return next(tool for tool in tools if tool.name == name)


class StubClient:
    async def inspect_ui_project(self, *, view=None):
        if view == "composition":
            return {
                "view": "composition",
                "appUIModel": {"hash": "a" * 64},
                "observationCoverage": [
                    "composition.model",
                    "composition.layout",
                    "composition.slots",
                    "composition.instances",
                    "capability.inventory",
                    "capability.composition-summary",
                    "creator.actions",
                ],
            }
        return {"project": True, "appUIModel": {"hash": "a" * 64}}

    async def inspect_app_ui_model(self):
        return {"hash": "b" * 64, "model": {}}

    async def list_ui_plugins(self):
        return {"plugins": [], "appUIModelHash": "c" * 64}

    async def inspect_ui_slots(
        self, *, target=None, app_ui_model_hash=None
    ):
        return {
            "target": target,
            "requestedHash": app_ui_model_hash,
            "appUIModelHash": "d" * 64,
        }

    async def inspect_ui_plugin(self, plugin_id):
        return {"pluginId": plugin_id}

    async def inspect_ui_services(self):
        return {
            "appUIModelHash": "e" * 64,
            "services": [],
            "plugins": [],
            "issues": [],
        }

    async def inspect_ui_plugin_source_references(self, plugin_id):
        return {"pluginId": plugin_id, "entry": "definition.ts"}

    async def inspect_agent_ui_sources(self):
        return {
            "stateHash": "f" * 64,
            "sourceRoot": "agent-ui",
            "metadataRoot": ".agent-ui",
            "items": [],
        }

    async def apply_agent_ui_source_item(self, *, item_id, expected_state_hash):
        return {
            "itemId": item_id,
            "changed": False,
            "changedItems": [],
            "changedPaths": [],
            "stateHash": expected_state_hash,
        }


def test_domain_tools_keep_ts_names_and_bounded_success_envelopes():
    tools = create_operator_tools(StubClient())

    assert set(tool.name for tool in tools).issuperset((
        *DOMAIN_READ_TOOL_NAMES,
        "apply_agent_ui_source_item",
    ))
    result = json.loads(asyncio.run(_tool(tools, "inspect_ui_plugin").ainvoke({"pluginId": "workspace-inspector"})))
    assert result == {
        "ok": True,
        "result": {"pluginId": "workspace-inspector"},
    }


def test_domain_tool_preserves_operator_error_code():
    client = StubClient()

    async def fail():
        raise OperatorError("OPERATOR_ENTRY_TIMEOUT", "timed out", {"seconds": 15})

    client.inspect_ui_project = fail
    tool = _tool(create_operator_tools(client), "inspect_ui_project")

    result = json.loads(asyncio.run(tool.ainvoke({})))
    assert result["error"]["code"] == "OPERATOR_ENTRY_TIMEOUT"


def test_service_inspection_distinguishes_resolved_provider_from_live_backend():
    tool = _tool(create_operator_tools(StubClient()), "inspect_ui_services")
    response = json.loads(asyncio.run(tool.ainvoke({})))

    assert response["result"]["availabilityEvidence"] == {
        "statusScope": "project composition and declared provider dependencies",
        "liveBackendConnection": "not tested by this inspection",
    }


def test_read_inventory_stops_after_evidence_and_reports_unverified_connection():
    assert "do not search for proof of an unobserved live connection" in DOMAIN_READ_AGENT_PROMPT


def test_source_inventory_marks_current_run_for_available_install_tool(tmp_path):
    observations = DomainObservationContext()
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("source-inventory")
    tool = _tool(create_operator_tools(
        StubClient(), observations=observations, activity=activity,
    ), "inspect_agent_ui_sources")
    assert observations.source_inventory_observed is False
    response = json.loads(asyncio.run(tool.ainvoke({})))
    assert response['ok'] is True
    assert response['result']['sourceInstallNavigation'] == {
        "statusScope": "source_item_installation_only",
        "pathConflictAuthorizesApplicationDeletion": False,
        "pluginTakeoverFactsVia": "inspect_ui_plugin_source_references",
        'tool': 'apply_agent_ui_source_item',
        'itemIdFrom': 'items[].id',
        'expectedStateHashFrom': 'stateHash',
        'filesystemSourceRoot': '/agent-ui',
    }
    assert observations.source_inventory_observed is True


@pytest.mark.parametrize("source_item_id", ["plugin/reusable", "agent-component/secondary"])
def test_existing_source_install_returns_explicit_observation_handoff(tmp_path, source_item_id):
    client = StubClient()

    async def installed(*, item_id, expected_state_hash):
        return {
            "itemId": item_id, "changed": True,
            "changedPaths": ["agent-ui/plugins/reusable/definition.ts"],
            "stateHash": expected_state_hash,
        }

    client.apply_agent_ui_source_item = installed
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("source-install")
    observations = DomainObservationContext()
    observations.observe_app_ui_model(
        hash="a" * 64, revision=activity.revision, source="inspect_app_ui_model",
    )
    tool = _tool(create_operator_tools(
        client, observations=observations, activity=activity,
    ), "apply_agent_ui_source_item")
    result = json.loads(asyncio.run(tool.ainvoke({
        "itemId": source_item_id, "expectedStateHash": "f" * 64,
    })))
    assert result["result"]["observationHandoff"] == {
        "appUIModelObservation": "invalidated_by_source_change",
        "nextReadBeforeComposition": "inspect_ui_project(view=composition)",
    }
    assert observations.current_hash(current_revision=activity.revision) is None


def test_source_reuse_guidance_precedes_unneeded_host_exploration():
    assert "exact returned id/stateHash" in DOMAIN_WRITE_AGENT_PROMPT
    assert "do not manually reproduce Registry templates" in DOMAIN_WRITE_AGENT_PROMPT
    assert "acquire fresh Composition before composing" in DOMAIN_WRITE_AGENT_PROMPT


def test_domain_slot_tool_forwards_layout_hash_binding():
    tool = _tool(create_operator_tools(StubClient()), "inspect_ui_slots")

    rendered = asyncio.run(tool.ainvoke({
        "target": {"type": "layout_slot", "slotRef": "l2"},
        "appUIModelHash": "a" * 64,
    }))

    assert json.loads(rendered)["result"] == {
        "target": {"type": "layout_slot", "slotRef": "l2"},
        "requestedHash": "a" * 64,
        "appUIModelHash": "d" * 64,
    }


def test_oversized_project_result_pages_complete_snapshot_without_truncation():
    client = StubClient()
    snapshot = {"source": "x" * (MAX_DOMAIN_TOOL_RESULT_CHARS + 1)}

    async def huge():
        return snapshot

    client.inspect_ui_project = huge
    tool = _tool(create_operator_tools(client), "inspect_ui_project")

    cursor = None
    chunks = []
    while True:
        rendered = asyncio.run(tool.ainvoke({"cursor": cursor} if cursor else {}))
        assert len(rendered) <= MAX_DOMAIN_TOOL_RESULT_CHARS
        page = json.loads(rendered)["result"]
        assert page["pageComplete"] is (page["nextCursor"] is None)
        chunks.append(page["pageText"])
        cursor = page["nextCursor"]
        if cursor is None:
            break

    assert json.loads("".join(chunks)) == {"ok": True, "result": snapshot}


def test_project_pages_keep_captured_snapshot_until_explicit_refresh():
    client = StubClient()
    snapshot = {"source": "x" * (MAX_DOMAIN_TOOL_RESULT_CHARS + 1)}

    async def huge():
        return snapshot

    client.inspect_ui_project = huge
    tool = _tool(create_operator_tools(client), "inspect_ui_project")
    first = json.loads(asyncio.run(tool.ainvoke({})))
    snapshot["source"] += "y"

    response = json.loads(asyncio.run(tool.ainvoke({"cursor": first["result"]["nextCursor"]})))

    assert response["ok"] is True
    refreshed = json.loads(asyncio.run(tool.ainvoke({})))
    assert refreshed["result"]["snapshotHash"] != first["result"]["snapshotHash"]
    stale = json.loads(asyncio.run(tool.ainvoke({"cursor": first["result"]["nextCursor"]})))
    assert stale["error"]["code"] == "OPERATOR_SNAPSHOT_STALE"


def test_skipped_project_page_cannot_authorize_mutation(tmp_path):
    from types import SimpleNamespace
    from unittest.mock import Mock
    from langchain.agents.middleware import ModelRequest
    from langchain_core.messages import ToolMessage
    from agent_ui_creator.domain_agent.tool_discovery import ProgressiveToolsMiddleware
    client = StubClient()
    snapshot = {
        "appUIModel": {"hash": "a" * 64},
        "observationCoverage": [
            "composition.model", "composition.layout", "composition.slots",
            "composition.instances", "capability.inventory",
            "capability.composition-summary",
        ],
        "padding": "x" * 70_000,
    }

    async def huge(*, view=None):
        return snapshot

    client.inspect_ui_project = huge
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("paging-run")
    observations = DomainObservationContext()
    tool = _tool(create_operator_tools(
        client, observations=observations, activity=activity,
    ), "inspect_ui_project")
    first = json.loads(asyncio.run(tool.ainvoke({"view": "composition"})))
    middleware = ProgressiveToolsMiddleware(observations, lambda: activity.revision)
    request = ModelRequest(model=Mock(), messages=[ToolMessage(name="inspect_ui_project",
        tool_call_id="page", content=json.dumps(first))], tools=[
            SimpleNamespace(name=name) for name in ["enable_creator_tools", "inspect_app_ui_model", "mutate_app_ui_model"]])
    def offered():
        return {item.name for item in middleware._request(request).tools}
    assert "inspect_app_ui_model" in offered()
    assert "mutate_app_ui_model" not in offered()
    assert first["appUIModelObservation"] == {"ready": False, "revision": 0,
        "reason": "APP_UI_MODEL_OBSERVATION_REQUIRED",
        "requiredInspection": {"tool": "inspect_app_ui_model", "arguments": {}}}
    assert observations.current_hash(current_revision=0) is None
    page = first["result"]
    last_offset = int(page["nextCursor"].rsplit(":", 1)[1]) + 1
    cursor_prefix = page["nextCursor"].rsplit(":", 1)[0]
    skipped = json.loads(asyncio.run(tool.ainvoke({
        "view": "composition", "cursor": f"{cursor_prefix}:{last_offset}",
    })))
    assert skipped["error"]["code"] == "OPERATOR_CURSOR_OUT_OF_ORDER"
    assert observations.current_hash(current_revision=0) is None
    try:
        observations.require_app_ui_model_hash(current_revision=0)
    except DomainObservationError as error:
        assert error.code == "APP_UI_MODEL_OBSERVATION_REQUIRED"
    else:
        raise AssertionError("Skipped pages authorized an AppUIModel mutation")

    class RejectingMutationService:
        def __init__(self):
            self.activity = activity
            self.calls = 0

        def record_observation_failure(self, **_kwargs):
            pass

        async def mutate(self, **_kwargs):
            self.calls += 1
            raise AssertionError("Mutation reached the target without full observation")

    service = RejectingMutationService()
    mutation_tool = create_app_ui_model_mutation_tool(service, observations)
    rejected = json.loads(asyncio.run(mutation_tool.ainvoke({
        "operations": [{"type": "set_plugin_enabled", "instanceId": "sample", "enabled": False}],
    })))
    assert rejected["error"]["code"] == "APP_UI_MODEL_OBSERVATION_REQUIRED"
    assert service.calls == 0

    cursor = page["nextCursor"]
    while cursor is not None:
        response = json.loads(asyncio.run(tool.ainvoke({
            "view": "composition", "cursor": cursor,
        })))
        assert response["ok"] is True
        cursor = response["result"]["nextCursor"]
    assert observations.current_hash(current_revision=activity.revision) == "a" * 64
    assert "mutate_app_ui_model" in offered()


def test_project_cursor_is_scoped_to_view_run_and_revision(tmp_path):
    client = StubClient()
    snapshot = {"appUIModel": {"hash": "a" * 64}, "padding": "x" * 70_000}

    async def huge(*, view=None):
        return snapshot

    client.inspect_ui_project = huge
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("first-run")
    first_tool = _tool(create_operator_tools(client, activity=activity), "inspect_ui_project")
    first = json.loads(asyncio.run(first_tool.ainvoke({"view": "composition"})))
    cursor = first["result"]["nextCursor"]

    wrong_view = json.loads(asyncio.run(first_tool.ainvoke({"cursor": cursor})))
    assert wrong_view["error"]["code"] == "OPERATOR_CURSOR_INVALID"

    other_run = _tool(create_operator_tools(client, activity=activity), "inspect_ui_project")
    wrong_run = json.loads(asyncio.run(other_run.ainvoke({
        "view": "composition", "cursor": cursor,
    })))
    assert wrong_run["error"]["code"] == "OPERATOR_CURSOR_INVALID"

    other_first = json.loads(asyncio.run(other_run.ainvoke({"view": "composition"})))
    assert other_first["result"]["nextCursor"] != cursor
    still_wrong_run = json.loads(asyncio.run(other_run.ainvoke({
        "view": "composition", "cursor": cursor,
    })))
    assert still_wrong_run["error"]["code"] == "OPERATOR_CURSOR_INVALID"

    hash_part, nonce, offset = cursor.split(":")
    forged_nonce = "0" * 32 if nonce != "0" * 32 else "1" * 32
    forged = json.loads(asyncio.run(first_tool.ainvoke({
        "view": "composition", "cursor": f"{hash_part}:{forged_nonce}:{offset}",
    })))
    assert forged["error"]["code"] == "OPERATOR_CURSOR_INVALID"

    activity.touch("src/agent-ui/plugins/changed.ts")
    changed_revision = json.loads(asyncio.run(first_tool.ainvoke({
        "view": "composition", "cursor": cursor,
    })))
    assert changed_revision["error"]["code"] == "OPERATOR_SNAPSHOT_STALE"


def test_project_page_retry_does_not_skip_missing_middle_pages(tmp_path):
    client = StubClient()
    snapshot = {"appUIModel": {"hash": "a" * 64}, "padding": "x" * 70_000}

    async def huge(*, view=None):
        return snapshot

    client.inspect_ui_project = huge
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("retry-run")
    tool = _tool(create_operator_tools(client, activity=activity), "inspect_ui_project")
    first = json.loads(asyncio.run(tool.ainvoke({"view": "composition"})))
    cursor = first["result"]["nextCursor"]
    middle = json.loads(asyncio.run(tool.ainvoke({
        "view": "composition", "cursor": cursor,
    })))
    repeat = json.loads(asyncio.run(tool.ainvoke({
        "view": "composition", "cursor": cursor,
    })))
    assert repeat["result"]["pageText"] == middle["result"]["pageText"]
    assert repeat["result"]["nextCursor"] == middle["result"]["nextCursor"]


def test_project_inspection_bounds_utf8_bytes_as_well_as_characters():
    client = StubClient()

    async def unicode_snapshot():
        return {"appUIModel": {"hash": "a" * 64}, "text": "😀" * 15_000}

    client.inspect_ui_project = unicode_snapshot
    tool = _tool(create_operator_tools(client), "inspect_ui_project")
    first = asyncio.run(tool.ainvoke({}))
    assert len(first) <= MAX_DOMAIN_TOOL_RESULT_CHARS
    assert len(first.encode("utf-8")) <= MAX_DOMAIN_TOOL_RESULT_CHARS
    assert json.loads(first)["result"]["nextCursor"] is not None


def test_authoritative_domain_reads_update_shared_observation(tmp_path):
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("domain-reads")
    observations = DomainObservationContext()
    tools = create_operator_tools(
        StubClient(),
        observations=observations,
        activity=activity,
    )

    for index, expected_hash, expected_source in (
        ('inspect_ui_project', "a" * 64, "inspect_ui_project"),
        ('inspect_app_ui_model', "b" * 64, "inspect_app_ui_model"),
        ('list_ui_plugins', "c" * 64, "list_ui_plugins"),
        ('inspect_ui_slots', "d" * 64, "inspect_ui_slots"),
        ('inspect_ui_services', "e" * 64, "inspect_ui_services"),
    ):
        asyncio.run(_tool(tools, index).ainvoke({}))
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
    tools = create_operator_tools(
        client,
        observations=observations,
        activity=activity,
    )
    asyncio.run(_tool(tools, "inspect_ui_project").ainvoke({}))

    async def fail():
        raise OperatorError("OPERATOR_ENTRY_TIMEOUT", "timed out")

    client.inspect_ui_project = fail
    asyncio.run(_tool(tools, "inspect_ui_project").ainvoke({}))

    assert observations.current_hash(current_revision=0) == "a" * 64


def test_composition_snapshot_grounds_and_rejects_fully_covered_reads(tmp_path):
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("composition-grounding")
    observations = DomainObservationContext()
    client = StubClient()
    tools = create_operator_tools(
        client,
        observations=observations,
        activity=activity,
    )

    snapshot = json.loads(
        asyncio.run(_tool(tools, "inspect_ui_project").ainvoke({"view": "composition"}))
    )
    assert snapshot["ok"] is True
    assert observations.composition_grounding_status(current_revision=0) == (
        "grounded"
    )

    for index, arguments in (
        ('inspect_ui_project', {"view": "composition"}),
        ('inspect_app_ui_model', {}),
        ('list_ui_plugins', {}),
        ('inspect_ui_slots', {}),
    ):
        covered = json.loads(asyncio.run(_tool(tools, index).ainvoke(arguments)))
        assert covered == {
            "ok": False,
            "error": {
                "code": "OBSERVATION_ALREADY_COVERED",
                "message": "Fresh Composition grounding already contains this fact.",
            },
        }

    assert observations.metrics.coveredReadRejections == 4
    activity.touch("app-ui/app-ui.json")
    assert observations.composition_grounding_status(current_revision=1) == "stale"
    refreshed = json.loads(asyncio.run(_tool(tools, "inspect_app_ui_model").ainvoke({})))
    assert refreshed["ok"] is True
    assert refreshed["result"]["hash"] == "b" * 64


def test_cross_layer_domain_reads_exit_without_full_project_detour(tmp_path):
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("composition-fast-path-domain-guard")
    observations = DomainObservationContext()
    client = StubClient()
    tools = create_operator_tools(
        client,
        observations=observations,
        activity=activity,
    )

    asyncio.run(_tool(tools, "inspect_ui_project").ainvoke({"view": "composition"}))
    for index, arguments in (
        ('inspect_ui_plugin', {"pluginId": "workspace-inspector"}),
        ('inspect_ui_services', {}),
        ('inspect_ui_plugin_source_references', {"pluginId": "workspace-inspector"}),
        ('inspect_agent_ui_sources', {}),
    ):
        result = json.loads(asyncio.run(_tool(tools, index).ainvoke(arguments)))
        assert result["ok"] is True
        assert observations.composition_grounding_status(current_revision=0) == "unobserved"

    full = json.loads(asyncio.run(_tool(tools, "inspect_ui_project").ainvoke({})))
    services = json.loads(asyncio.run(_tool(tools, "inspect_ui_services").ainvoke({})))
    assert full["ok"] is True
    assert services["ok"] is True
    assert observations.composition_grounding_status(current_revision=0) == (
        "unobserved"
    )
    assert observations.current_hash(current_revision=0) == "e" * 64
    metrics = observations.composition_fast_path_metrics.to_dict()
    assert metrics["attempted"] is True
    assert metrics["eligible"] is True
    assert metrics["compositionSnapshots"] == 1
    assert metrics["fastPathExits"] == 1
    assert metrics["crossLayerReadAttemptsBeforeMutation"] == 1


def test_stale_composition_grounding_does_not_block_domain_reads(tmp_path):
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("composition-fast-path-stale")
    observations = DomainObservationContext()
    tools = create_operator_tools(
        StubClient(),
        observations=observations,
        activity=activity,
    )

    asyncio.run(_tool(tools, "inspect_ui_project").ainvoke({"view": "composition"}))
    activity.touch("app-ui/app-ui.json")
    services = json.loads(asyncio.run(_tool(tools, "inspect_ui_services").ainvoke({})))

    assert services["ok"] is True
    assert observations.composition_grounding_status(current_revision=1) == "unobserved"


def test_agent_ui_source_tools_keep_inspection_read_only_and_apply_is_a_noop(tmp_path):
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("agent-ui-sources")
    tools = create_operator_tools(StubClient(), activity=activity)

    inspected = json.loads(asyncio.run(_tool(tools, "inspect_agent_ui_sources").ainvoke({})))
    applied = json.loads(
        asyncio.run(
            next(tool for tool in tools if tool.name == "apply_agent_ui_source_item").ainvoke(
                {"itemId": "primitive/button", "expectedStateHash": "f" * 64}
            )
        )
    )

    assert inspected["result"]["sourceRoot"] == "agent-ui"
    assert applied["result"]["changed"] is False
    assert activity.semantic_noop == {
        "source": "apply_agent_ui_source_item",
        "reason": "already-managed",
    }


@pytest.mark.parametrize("symbols", [["TimelineCall"], '["TimelineCall"]'])
def test_shared_type_query_normalizes_json_arrays_without_granting_source_access(symbols):
    class SharedClient(StubClient):
        async def inspect_ui_plugin(self, plugin_id, shared_symbols=None):
            assert shared_symbols == ["TimelineCall"]
            return {"pluginId": plugin_id, "symbols": shared_symbols}
    tools = create_operator_tools(SharedClient())
    value = json.loads(asyncio.run(_tool(tools,"inspect_ui_plugin").ainvoke({"pluginId":"tool-timeline","sharedSymbols":symbols})))
    assert value["ok"] is True
    assert value["result"]["symbols"] == ["TimelineCall"]


def test_shared_module_query_forwards_the_explicit_public_boundary():
    class SharedClient(StubClient):
        async def inspect_ui_plugin(self, plugin_id, shared_symbols=None, shared_module=None):
            assert shared_symbols == ["AgentUIDialog.Root.$parameter0"]
            assert shared_module == "@za38.03/agent-ui-plugins"
            return {"module": shared_module}
    tools = create_operator_tools(SharedClient())
    value = json.loads(asyncio.run(_tool(tools, "inspect_ui_plugin").ainvoke({
        "pluginId": "response-footer", "sharedSymbols": ["AgentUIDialog.Root.$parameter0"],
        "sharedModule": "@za38.03/agent-ui-plugins",
    })))
    assert value["ok"] is True
    assert value["result"]["module"] == "@za38.03/agent-ui-plugins"


def test_plugin_contract_compaction_reinspects_and_delivers_changed_contracts():
    class Client(StubClient):
        calls = 0
        changed = False
        async def inspect_ui_plugin(self, plugin_id, shared_symbols=None):
            self.calls += 1
            return {"asset": {"pluginId": plugin_id, "ownership": "project_source"},
                    "appUIModelHash": str(self.calls),
                    "application": {"entryPath": "src/plugins/foo/index.tsx", "implementationOwnership": "project",
                        "publicApi": {"status": "available", "props": [{"name": "changed" if self.changed else "open"}]},
                        "sharedTypes": {"status": "available", "symbols": [{"name": name, "type": "string"} for name in (shared_symbols or [])]}}}
    client = Client()
    inspect = _tool(create_operator_tools(client), "inspect_ui_plugin")
    async def check():
        first = json.loads(await inspect.ainvoke({"pluginId": "foo", "sharedSymbols": '["Messages.toolTimeline"]'}))["result"]
        second = json.loads(await inspect.ainvoke({"pluginId": "foo", "sharedSymbols": ["Messages.toolTimeline"]}))["result"]
        assert client.calls == 2
        assert first["application"]["publicApi"]["props"] == [{"name": "open"}]
        assert second["application"]["publicApi"]["unchanged"] is True
        assert second["application"]["sharedTypes"]["unchanged"] is True
        assert second["application"]["publicApi"]["contractReference"] == first["application"]["publicApi"]["contractReference"]
        assert second["appUIModelHash"] == "2"
        await inspect.ainvoke({"pluginId": "foo", "sharedSymbols": ["Different"]})
        repeated = json.loads(await inspect.ainvoke({"pluginId": "foo", "sharedSymbols": ["Messages.toolTimeline"]}))["result"]
        assert repeated["application"]["sharedTypes"]["unchanged"] is True
        assert client.calls == 4  # Reinspect each request, including a prior non-adjacent contract.
        client.changed = True
        third = json.loads(await inspect.ainvoke({"pluginId": "foo"}))["result"]
        assert third["application"]["publicApi"]["props"] == [{"name": "changed"}]
        assert third["application"]["publicApi"]["contractReference"] != first["application"]["publicApi"]["contractReference"]
    asyncio.run(check())


def test_undelivered_oversized_contract_is_never_referenced(monkeypatch):
    import agent_ui_creator.domain_tools.operator_tools as module
    class Client(StubClient):
        async def inspect_ui_plugin(self, plugin_id):
            return {"application": {"publicApi": {"status": "available", "props": ["x" * 1000]}}}
    inspect = _tool(create_operator_tools(Client()), "inspect_ui_plugin")
    async def check():
        monkeypatch.setattr(module, "MAX_DOMAIN_TOOL_RESULT_CHARS", 100)
        first = json.loads(await inspect.ainvoke({"pluginId": "foo"}))
        assert first["ok"] is False
        monkeypatch.setattr(module, "MAX_DOMAIN_TOOL_RESULT_CHARS", 48000)
        second = json.loads(await inspect.ainvoke({"pluginId": "foo"}))["result"]
        assert "props" in second["application"]["publicApi"]
    asyncio.run(check())


def test_custom_plugin_shared_contract_is_delivered_and_compacted_without_application_metadata():
    class Client(StubClient):
        async def inspect_ui_plugin(self, plugin_id, shared_symbols=None, shared_module=None):
            return {"asset": {"pluginId": plugin_id, "ownership": "project_source"},
                    "sharedTypes": {"status": "available", "module": shared_module,
                                    "symbols": [{"name": "Dialog", "status": "available"}]}}
    inspect = _tool(create_operator_tools(Client()), "inspect_ui_plugin")
    async def check():
        args={"pluginId":"custom", "sharedSymbols":["Dialog"],"sharedModule":"@za38.03/agent-ui-plugins"}
        first=json.loads(await inspect.ainvoke(args))["result"]
        second=json.loads(await inspect.ainvoke(args))["result"]
        assert "application" not in first
        assert first["sharedTypes"]["symbols"][0]["status"] == "available"
        assert second["sharedTypes"]["unchanged"] is True
        assert first["sharedTypes"]["contractReference"] == second["sharedTypes"]["contractReference"]
    asyncio.run(check())
