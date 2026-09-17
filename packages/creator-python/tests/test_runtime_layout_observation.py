from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError as PydanticValidationError

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.domain_state import DomainObservationContext
from agent_ui_creator.domain_agent.prompt import DOMAIN_WRITE_AGENT_PROMPT
from agent_ui_creator.observability import CreatorRunLogger
from agent_ui_creator.project_control import ProjectControlMetrics
from agent_ui_creator.runtime_diagnostics import (
    RuntimeDiagnosticEnvelope,
    RuntimeDiagnosticInspectionService,
    RuntimeDiagnosticStore,
    create_runtime_layout_tool,
)
from agent_ui_creator.domain_agent.tool_policy import READ_ONLY_TOOL_NAMES


APP_HASH = "a" * 64


def test_runtime_layout_tool_is_read_only_in_both_domain_policies():
    assert "inspect_runtime_layout" in READ_ONLY_TOOL_NAMES


def test_prompt_requires_geometry_evidence_only_for_visible_layout_outcomes():
    prompt = " ".join(DOMAIN_WRITE_AGENT_PROMPT.split())
    for rule in (
        "explicit user-visible geometry request",
        "static AppUIModel validity is not completion evidence",
        "read-only inspect_runtime_layout tool",
        "compare the fresh rectangles",
        "continue diagnosis and repair",
        "visual verification was not available",
        "Geometry checks are demand-driven",
        "Authoring Layout nodeRefs",
    ):
        assert rule in prompt


def layout_envelope(*, app_hash: str = APP_HASH) -> RuntimeDiagnosticEnvelope:
    return RuntimeDiagnosticEnvelope.model_validate(
        {
            "threadId": "layout-thread",
            "composition": {
                "schemaVersion": 1,
                "appUIModelHash": app_hash,
                "observedAt": datetime.now(timezone.utc).isoformat(),
                "instances": [
                    {
                        "instanceId": "sidebar-main",
                        "pluginId": "conversation-thread-list",
                        "slotId": "layout-slot:root.children%5B0%5D.child",
                        "slotPath": "root.children[0].child",
                        "rect": {"x": 0, "y": 0, "width": 280, "height": 800},
                    },
                    {
                        "instanceId": "surface-main",
                        "pluginId": "agent-conversation-surface",
                        "slotId": "layout-slot:root.children%5B1%5D.child",
                        "rect": {"x": 280, "y": 0, "width": 1120, "height": 800},
                    },
                ],
                "slots": [
                    {
                        "slotId": "layout-slot:root.children%5B0%5D.child",
                        "slotPath": "root.children[0].child",
                        "widthClass": "narrow",
                        "rect": {"x": 0, "y": 0, "width": 280, "height": 800},
                    },
                    {
                        "slotId": "layout-slot:root.children%5B1%5D.child",
                        "slotPath": "root.children[1].child",
                        "widthClass": "wide",
                        "rect": {"x": 280, "y": 0, "width": 1120, "height": 800},
                    },
                ],
                "viewport": {"width": 1400, "height": 800},
                "layoutNodes": [
                    {
                        "nodeId": "layout-node:root",
                        "type": "row",
                        "rect": {"x": 0, "y": 0, "width": 1400, "height": 800},
                    },
                    {
                        "nodeId": "layout-node:root.children%5B0%5D",
                        "type": "panel",
                        "rect": {"x": 0, "y": 0, "width": 280, "height": 800},
                    },
                ],
            },
        }
    )


def composition_project(*, app_hash: str = APP_HASH) -> dict[str, object]:
    return {
        "appUIModel": {
            "hash": app_hash,
            "layout": {
                "nodeRef": "l0",
                "type": "row",
                "children": [
                    {
                        "nodeRef": "l1",
                        "type": "panel",
                        "child": {
                            "nodeRef": "l2",
                            "type": "slot",
                            "plugins": [],
                        },
                    },
                    {
                        "nodeRef": "l3",
                        "type": "panel",
                        "child": {
                            "nodeRef": "l4",
                            "type": "slot",
                            "plugins": [],
                        },
                    },
                ],
            },
            "slots": [
                {
                    "target": {"type": "layout_slot", "slotRef": "l2"},
                    "nodeRef": "l2",
                    "plugins": [],
                },
                {
                    "target": {"type": "layout_slot", "slotRef": "l4"},
                    "nodeRef": "l4",
                    "plugins": [],
                },
                {
                    "target": {
                        "type": "plugin_slot",
                        "parentInstanceId": "surface-main",
                        "slot": "emptySuggestions",
                    },
                    "description": "Optional empty-state suggestions.",
                    "cardinality": "one",
                    "optional": True,
                    "owner": {
                        "kind": "plugin",
                        "instanceId": "surface-main",
                        "pluginId": "agent-conversation-surface",
                    },
                    "plugins": [],
                },
            ],
        },
        "plugins": [],
    }


class CompositionProjectControl:
    metrics = ProjectControlMetrics()

    def __init__(self, project: dict[str, object]):
        self.project = project

    async def inspect_ui_project(self, *, view=None):
        assert view == "composition"
        return self.project


def test_geometry_schema_accepts_bounded_observations_and_rejects_malformed_values():
    envelope = layout_envelope()
    assert envelope.composition is not None
    assert envelope.composition.layoutNodes is not None
    assert envelope.composition.layoutNodes[0].rect.width == 1400

    invalid = layout_envelope().model_dump(mode="json")
    assert isinstance(invalid["composition"], dict)
    invalid["composition"]["viewport"] = {"width": 1_000_001, "height": 800}
    with pytest.raises(PydanticValidationError):
        RuntimeDiagnosticEnvelope.model_validate(invalid)

    invalid_extra = layout_envelope().model_dump(mode="json")
    assert isinstance(invalid_extra["composition"], dict)
    invalid_extra["composition"]["layoutNodes"][0]["css"] = "display:grid"
    with pytest.raises(PydanticValidationError):
        RuntimeDiagnosticEnvelope.model_validate(invalid_extra)

    too_many = layout_envelope().model_dump(mode="json")
    assert isinstance(too_many["composition"], dict)
    too_many["composition"]["layoutNodes"] = [
        {
            "nodeId": f"node-{index}",
            "type": "row",
            "rect": {"x": 0, "y": 0, "width": 1, "height": 1},
        }
        for index in range(201)
    ]
    with pytest.raises(PydanticValidationError):
        RuntimeDiagnosticEnvelope.model_validate(too_many)


def test_layout_inspection_requires_current_hash_and_fresh_composition():
    store = RuntimeDiagnosticStore()
    store.record(layout_envelope())

    current = store.inspect_runtime_layout(
        thread_id="layout-thread",
        current_app_ui_model_hash=APP_HASH,
    )
    stale = store.inspect_runtime_layout(
        thread_id="layout-thread",
        current_app_ui_model_hash="b" * 64,
    )

    assert current["runtimeStatus"] == "available"
    assert current["compositionFresh"] is True
    assert current["instances"][0] == {
        "instanceId": "sidebar-main",
        "pluginId": "conversation-thread-list",
        "rect": {"x": 0.0, "y": 0.0, "width": 280.0, "height": 800.0},
    }
    assert current["slots"][0]["slotId"] == (
        "layout-slot:root.children%5B0%5D.child"
    )
    assert current["layoutNodes"][0]["nodeId"] == "layout-node:root"
    assert stale["runtimeStatus"] == "stale"
    assert stale["compositionFresh"] is False
    assert stale["instances"] == []
    assert stale["layoutNodes"] == []


def test_layout_tool_is_sanitized_filtered_and_read_only(tmp_path):
    logger = CreatorRunLogger(tmp_path)
    logger.begin(run_id="layout-run", thread_id="layout-thread")
    activity = CreatorActivityRecorder(tmp_path, logger=logger)
    activity.begin("layout-run")
    store = RuntimeDiagnosticStore()
    store.record(layout_envelope())

    service = RuntimeDiagnosticInspectionService(
        store=store,
        thread_id="layout-thread",
        project_control=CompositionProjectControl(composition_project()),
        observations=DomainObservationContext(),
        activity=activity,
    )
    tool = create_runtime_layout_tool(service)
    rendered = asyncio.run(
        tool.ainvoke(
            {
                "instanceIds": ["sidebar-main"],
                "nodeRefs": ["l0"],
            }
        )
    )
    payload = json.loads(rendered)

    assert payload["ok"] is True
    result = payload["result"]
    assert result["runtimeStatus"] == "available"
    assert result["instances"] == [
        {
            "instanceId": "sidebar-main",
            "pluginId": "conversation-thread-list",
            "rect": {"x": 0.0, "y": 0.0, "width": 280.0, "height": 800.0},
        }
    ]
    assert result["layoutNodes"] == [
        {
            "nodeRef": "l0",
            "type": "row",
            "rect": {"x": 0.0, "y": 0.0, "width": 1400.0, "height": 800.0},
        }
    ]
    assert "slots" not in result
    assert "slotPath" not in rendered
    assert "layout-node:" not in rendered
    assert "layout-slot:" not in rendered
    assert '"nodeId"' not in rendered
    assert '"slotId"' not in rendered
    assert activity.revision == 0

    logger.record_tool_observation(
        model_call_sequence=1,
        tool_name="inspect_runtime_layout",
        phase="read_only",
        arguments={
            "instanceIds": ["sidebar-main"],
            "nodeRefs": ["l0"],
        },
        result=payload,
    )

    entries = [
        json.loads(line)
        for line in logger.path.read_text(encoding="utf-8").splitlines()
    ]
    inspection_entries = [
        entry for entry in entries if entry["type"] == "runtime_layout_inspection"
    ]
    assert inspection_entries[-1]["data"] == {
        "toolName": "inspect_runtime_layout",
        "currentHash": APP_HASH,
        "compositionFresh": True,
        "requestedInstanceCount": 1,
        "requestedNodeRefCount": 1,
        "unmappedLayoutNodeCount": 0,
        "returnedInstanceCount": 1,
        "returnedLayoutNodeCount": 1,
    }
    trajectory = [
        entry for entry in entries if entry["type"] == "creator_tool_observation"
    ]
    assert trajectory[-1]["data"]["arguments"] == {
        "instanceIdCount": 1,
        "nodeRefCount": 1,
    }
    assert trajectory[-1]["data"]["result"]["factKinds"] == [
        "runtime.layout.observation"
    ]


def test_layout_tool_rejects_unbounded_filters(tmp_path):
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("layout-run")
    service = RuntimeDiagnosticInspectionService(
        store=RuntimeDiagnosticStore(),
        thread_id="layout-thread",
        project_control=object(),
        observations=DomainObservationContext(),
        activity=activity,
    )
    tool = create_runtime_layout_tool(service)
    schema = tool.args_schema.model_json_schema()
    assert schema["properties"]["instanceIds"]["anyOf"][0]["maxItems"] == 200
    assert (
        schema["properties"]["nodeRefs"]["anyOf"][0]["items"]["maxLength"]
        == 200
    )
    assert "layoutNodeIds" not in schema["properties"]
    with pytest.raises(PydanticValidationError):
        asyncio.run(tool.ainvoke({"instanceIds": ["x"] * 201}))


def test_node_ref_filter_applies_after_authoring_projection(tmp_path):
    class RecordingStore(RuntimeDiagnosticStore):
        def __init__(self):
            super().__init__()
            self.received_layout_node_ids = None

        def inspect_runtime_layout(self, **kwargs):
            self.received_layout_node_ids = kwargs["layout_node_ids"]
            return super().inspect_runtime_layout(**kwargs)

    recording_store = RecordingStore()
    recording_store.record(layout_envelope())
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("node-ref-filter")
    service = RuntimeDiagnosticInspectionService(
        store=recording_store,
        thread_id="layout-thread",
        project_control=CompositionProjectControl(composition_project()),
        observations=DomainObservationContext(),
        activity=activity,
    )

    result = asyncio.run(service.inspect_layout(node_refs=["l1"]))

    assert recording_store.received_layout_node_ids is None
    assert result["layoutNodes"] == [
        {
            "nodeRef": "l1",
            "type": "panel",
            "rect": {"x": 0.0, "y": 0.0, "width": 280.0, "height": 800.0},
        }
    ]


def test_stale_node_ref_is_rejected_deterministically(tmp_path):
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("stale-node-ref")
    service = RuntimeDiagnosticInspectionService(
        store=RuntimeDiagnosticStore(),
        thread_id="layout-thread",
        project_control=CompositionProjectControl(composition_project()),
        observations=DomainObservationContext(),
        activity=activity,
    )
    tool = create_runtime_layout_tool(service)

    payload = json.loads(
        asyncio.run(tool.ainvoke({"nodeRefs": ["stale-ref"]}))
    )

    assert payload == {
        "ok": False,
        "error": {
            "code": "RUNTIME_LAYOUT_REFERENCE_INVALID",
            "message": (
                "nodeRefs contains a reference that is not valid for the "
                "current AppUIModel observation."
            ),
        },
    }
    assert "layout-node:" not in json.dumps(payload)


def test_unmapped_runtime_layout_node_is_omitted_and_counted_in_host_log(tmp_path):
    raw = layout_envelope().model_dump(mode="json")
    assert isinstance(raw["composition"], dict)
    raw["composition"]["layoutNodes"].append(
        {
            "nodeId": "layout-node:root.children%5B99%5D",
            "type": "panel",
            "rect": {"x": 0, "y": 0, "width": 1, "height": 1},
        }
    )
    store = RuntimeDiagnosticStore()
    store.record(RuntimeDiagnosticEnvelope.model_validate(raw))
    logger = CreatorRunLogger(tmp_path)
    logger.begin(run_id="unmapped-layout-node", thread_id="layout-thread")
    activity = CreatorActivityRecorder(tmp_path, logger=logger)
    activity.begin("unmapped-layout-node")
    service = RuntimeDiagnosticInspectionService(
        store=store,
        thread_id="layout-thread",
        project_control=CompositionProjectControl(composition_project()),
        observations=DomainObservationContext(),
        activity=activity,
    )

    result = asyncio.run(service.inspect_layout())
    rendered = json.dumps(result, ensure_ascii=False)
    entries = [
        json.loads(line)
        for line in logger.path.read_text(encoding="utf-8").splitlines()
    ]
    inspection = [
        entry for entry in entries if entry["type"] == "runtime_layout_inspection"
    ][-1]

    assert "root.children%5B99%5D" not in rendered
    assert inspection["data"]["unmappedLayoutNodeCount"] == 1


def test_model_facing_layout_result_contains_no_runtime_identity(tmp_path):
    store = RuntimeDiagnosticStore()
    store.record(layout_envelope())
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("layout-leak-check")
    service = RuntimeDiagnosticInspectionService(
        store=store,
        thread_id="layout-thread",
        project_control=CompositionProjectControl(composition_project()),
        observations=DomainObservationContext(),
        activity=activity,
    )
    tool = create_runtime_layout_tool(service)

    rendered = asyncio.run(tool.ainvoke({}))

    for forbidden in (
        "layout-node:",
        "layout-slot:",
        "slotPath",
        '"slotId"',
        '"nodeId"',
    ):
        assert forbidden not in rendered
    assert '"slots"' not in rendered
    assert "instanceId" in rendered


def test_layout_inspection_keeps_revision_unchanged(tmp_path):
    store = RuntimeDiagnosticStore()
    store.record(layout_envelope())
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("layout-read-only")
    service = RuntimeDiagnosticInspectionService(
        store=store,
        thread_id="layout-thread",
        project_control=CompositionProjectControl(composition_project()),
        observations=DomainObservationContext(),
        activity=activity,
    )

    asyncio.run(service.inspect_layout(node_refs=["l1", "l3"]))

    assert activity.revision == 0


def test_store_remains_internal_runtime_identity_boundary():
    store = RuntimeDiagnosticStore()
    store.record(layout_envelope())

    result = store.inspect_runtime_layout(
        thread_id="layout-thread",
        current_app_ui_model_hash=APP_HASH,
    )

    assert result["layoutNodes"][0]["nodeId"] == "layout-node:root"
    assert result["slots"][0]["slotId"] == (
        "layout-slot:root.children%5B0%5D.child"
    )
