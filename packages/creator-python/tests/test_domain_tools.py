from __future__ import annotations

import asyncio
import json
import pytest
from agent_ui_creator.domain_tools import (
    DOMAIN_READ_TOOL_NAMES,
    MAX_DOMAIN_TOOL_RESULT_CHARS,
    create_project_control_tools,
)
from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.domain_state import DomainObservationContext
from agent_ui_creator.domain_state import DomainObservationError
from agent_ui_creator.project_control import ProjectControlError
from agent_ui_creator.domain_agent.prompt import DOMAIN_READ_AGENT_PROMPT, DOMAIN_WRITE_AGENT_PROMPT
from agent_ui_creator.app_ui_model.mutation_tool import create_app_ui_model_mutation_tool


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
    tools = create_project_control_tools(StubClient())

    assert tuple(tool.name for tool in tools) == (
        *DOMAIN_READ_TOOL_NAMES,
        "apply_agent_ui_source_item",
    )
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


def test_service_inspection_distinguishes_resolved_provider_from_live_backend():
    tool = create_project_control_tools(StubClient())[5]
    response = json.loads(asyncio.run(tool.ainvoke({})))

    assert response["result"]["availabilityEvidence"] == {
        "statusScope": "project composition and declared provider dependencies",
        "liveBackendConnection": "not tested by this inspection",
    }


def test_read_inventory_stops_after_evidence_and_reports_unverified_connection():
    assert "answer from observed facts" in DOMAIN_READ_AGENT_PROMPT


def test_source_inventory_marks_current_run_for_available_install_tool(tmp_path):
    observations = DomainObservationContext()
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("source-inventory")
    tool = create_project_control_tools(
        StubClient(), observations=observations, activity=activity,
    )[7]
    assert observations.source_inventory_observed is False
    response = json.loads(asyncio.run(tool.ainvoke({})))
    assert response['ok'] is True
    assert response['result']['sourceInstallNavigation'] == {
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
    tool = create_project_control_tools(
        client, observations=observations, activity=activity,
    )[-1]
    result = json.loads(asyncio.run(tool.ainvoke({
        "itemId": source_item_id, "expectedStateHash": "f" * 64,
    })))
    assert result["result"]["observationHandoff"] == {
        "appUIModelObservation": "invalidated_by_source_change",
        "nextReadBeforeComposition": "inspect_ui_project(view=composition)",
    }
    assert observations.current_hash(current_revision=activity.revision) is None


def test_source_reuse_guidance_precedes_unneeded_host_exploration():
    assert "inspect existing and formal Source Item availability" in DOMAIN_WRITE_AGENT_PROMPT
    assert "An incomplete inventory is not proof of absence" in DOMAIN_WRITE_AGENT_PROMPT


def test_domain_slot_tool_forwards_layout_hash_binding():
    tool = create_project_control_tools(StubClient())[3]

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
    tool = create_project_control_tools(client)[0]

    cursor = None
    chunks = []
    while True:
        rendered = asyncio.run(tool.ainvoke({"cursor": cursor} if cursor else {}))
        assert len(rendered) < MAX_DOMAIN_TOOL_RESULT_CHARS
        page = json.loads(rendered)["result"]
        assert page["pageComplete"] is (page["nextCursor"] is None)
        chunks.append(page["pageText"])
        cursor = page["nextCursor"]
        if cursor is None:
            break

    assert json.loads("".join(chunks)) == {"ok": True, "result": snapshot}


def test_project_page_cursor_rejects_changed_snapshot():
    client = StubClient()
    snapshot = {"source": "x" * (MAX_DOMAIN_TOOL_RESULT_CHARS + 1)}

    async def huge():
        return snapshot

    client.inspect_ui_project = huge
    tool = create_project_control_tools(client)[0]
    first = json.loads(asyncio.run(tool.ainvoke({})))
    snapshot["source"] += "y"

    response = json.loads(asyncio.run(tool.ainvoke({"cursor": first["result"]["nextCursor"]})))

    assert response["error"]["code"] == "PROJECT_CONTROL_SNAPSHOT_STALE"


def test_skipped_project_page_cannot_authorize_mutation(tmp_path):
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
    tool = create_project_control_tools(
        client, observations=observations, activity=activity,
    )[0]
    first = json.loads(asyncio.run(tool.ainvoke({"view": "composition"})))
    assert observations.current_hash(current_revision=0) is None
    page = first["result"]
    last_offset = ((page["totalChars"] - 1) // 20_000) * 20_000
    cursor_prefix = page["nextCursor"].rsplit(":", 1)[0]
    skipped = json.loads(asyncio.run(tool.ainvoke({
        "view": "composition", "cursor": f"{cursor_prefix}:{last_offset}",
    })))
    assert skipped["error"]["code"] == "PROJECT_CONTROL_CURSOR_OUT_OF_ORDER"
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


def test_project_cursor_is_scoped_to_view_run_and_revision(tmp_path):
    client = StubClient()
    snapshot = {"appUIModel": {"hash": "a" * 64}, "padding": "x" * 70_000}

    async def huge(*, view=None):
        return snapshot

    client.inspect_ui_project = huge
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("first-run")
    first_tool = create_project_control_tools(client, activity=activity)[0]
    first = json.loads(asyncio.run(first_tool.ainvoke({"view": "composition"})))
    cursor = first["result"]["nextCursor"]

    wrong_view = json.loads(asyncio.run(first_tool.ainvoke({"cursor": cursor})))
    assert wrong_view["error"]["code"] == "PROJECT_CONTROL_CURSOR_INVALID"

    other_run = create_project_control_tools(client, activity=activity)[0]
    wrong_run = json.loads(asyncio.run(other_run.ainvoke({
        "view": "composition", "cursor": cursor,
    })))
    assert wrong_run["error"]["code"] == "PROJECT_CONTROL_CURSOR_INVALID"

    other_first = json.loads(asyncio.run(other_run.ainvoke({"view": "composition"})))
    assert other_first["result"]["nextCursor"] != cursor
    still_wrong_run = json.loads(asyncio.run(other_run.ainvoke({
        "view": "composition", "cursor": cursor,
    })))
    assert still_wrong_run["error"]["code"] == "PROJECT_CONTROL_CURSOR_INVALID"

    hash_part, nonce, offset = cursor.split(":")
    forged_nonce = "0" * 32 if nonce != "0" * 32 else "1" * 32
    forged = json.loads(asyncio.run(first_tool.ainvoke({
        "view": "composition", "cursor": f"{hash_part}:{forged_nonce}:{offset}",
    })))
    assert forged["error"]["code"] == "PROJECT_CONTROL_CURSOR_INVALID"

    activity.touch("src/agent-ui/plugins/changed.ts")
    changed_revision = json.loads(asyncio.run(first_tool.ainvoke({
        "view": "composition", "cursor": cursor,
    })))
    assert changed_revision["error"]["code"] == "PROJECT_CONTROL_SNAPSHOT_STALE"


def test_project_page_retry_does_not_skip_missing_middle_pages(tmp_path):
    client = StubClient()
    snapshot = {"appUIModel": {"hash": "a" * 64}, "padding": "x" * 70_000}

    async def huge(*, view=None):
        return snapshot

    client.inspect_ui_project = huge
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("retry-run")
    tool = create_project_control_tools(client, activity=activity)[0]
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
    tool = create_project_control_tools(client)[0]
    first = asyncio.run(tool.ainvoke({}))
    assert len(first) <= MAX_DOMAIN_TOOL_RESULT_CHARS
    assert len(first.encode("utf-8")) <= MAX_DOMAIN_TOOL_RESULT_CHARS
    assert json.loads(first)["result"]["nextCursor"] is not None


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
        (5, "e" * 64, "inspect_ui_services"),
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


def test_composition_snapshot_grounds_and_rejects_fully_covered_reads(tmp_path):
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("composition-grounding")
    observations = DomainObservationContext()
    client = StubClient()
    tools = create_project_control_tools(
        client,
        observations=observations,
        activity=activity,
    )

    snapshot = json.loads(
        asyncio.run(tools[0].ainvoke({"view": "composition"}))
    )
    assert snapshot["ok"] is True
    assert observations.composition_grounding_status(current_revision=0) == (
        "grounded"
    )

    for index, arguments in (
        (0, {"view": "composition"}),
        (1, {}),
        (2, {}),
        (3, {}),
    ):
        covered = json.loads(asyncio.run(tools[index].ainvoke(arguments)))
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
    refreshed = json.loads(asyncio.run(tools[1].ainvoke({})))
    assert refreshed["ok"] is True
    assert refreshed["result"]["hash"] == "b" * 64


def test_composition_fast_path_blocks_domain_reads_until_full_project_exit(tmp_path):
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("composition-fast-path-domain-guard")
    observations = DomainObservationContext()
    client = StubClient()
    tools = create_project_control_tools(
        client,
        observations=observations,
        activity=activity,
    )

    asyncio.run(tools[0].ainvoke({"view": "composition"}))
    for index, arguments in (
        (4, {"pluginId": "workspace-inspector"}),
        (5, {}),
        (6, {"pluginId": "workspace-inspector"}),
        (7, {}),
    ):
        prohibited = json.loads(asyncio.run(tools[index].ainvoke(arguments)))
        assert prohibited["error"]["code"] == (
            "COMPOSITION_FAST_PATH_CROSS_LAYER_READ_PROHIBITED"
        )

    full = json.loads(asyncio.run(tools[0].ainvoke({})))
    services = json.loads(asyncio.run(tools[5].ainvoke({})))
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
    assert metrics["crossLayerReadAttemptsBeforeMutation"] == 4


def test_stale_composition_grounding_does_not_block_domain_reads(tmp_path):
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("composition-fast-path-stale")
    observations = DomainObservationContext()
    tools = create_project_control_tools(
        StubClient(),
        observations=observations,
        activity=activity,
    )

    asyncio.run(tools[0].ainvoke({"view": "composition"}))
    activity.touch("app-ui/app-ui.json")
    services = json.loads(asyncio.run(tools[5].ainvoke({})))

    assert services["ok"] is True
    assert observations.composition_grounding_status(current_revision=1) == "stale"


def test_agent_ui_source_tools_keep_inspection_read_only_and_apply_is_a_noop(tmp_path):
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("agent-ui-sources")
    tools = create_project_control_tools(StubClient(), activity=activity)

    inspected = json.loads(asyncio.run(tools[7].ainvoke({})))
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
