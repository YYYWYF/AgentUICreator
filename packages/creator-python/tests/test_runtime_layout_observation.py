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
                        "slotId": "sidebar.slot",
                        "slotPath": "root.children[0]",
                        "rect": {"x": 0, "y": 0, "width": 280, "height": 800},
                    },
                    {
                        "instanceId": "surface-main",
                        "pluginId": "agent-conversation-surface",
                        "slotId": "surface.slot",
                        "rect": {"x": 280, "y": 0, "width": 1120, "height": 800},
                    },
                ],
                "slots": [
                    {
                        "slotId": "sidebar.slot",
                        "widthClass": "narrow",
                        "rect": {"x": 0, "y": 0, "width": 280, "height": 800},
                    }
                ],
                "viewport": {"width": 1400, "height": 800},
                "layoutNodes": [
                    {
                        "nodeId": "root-row",
                        "type": "row",
                        "rect": {"x": 0, "y": 0, "width": 1400, "height": 800},
                    },
                    {
                        "nodeId": "sidebar-panel",
                        "type": "panel",
                        "rect": {"x": 0, "y": 0, "width": 280, "height": 800},
                    },
                ],
            },
        }
    )


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

    class ProjectControl:
        metrics = ProjectControlMetrics()

        async def inspect_ui_project(self, *, view=None):
            assert view == "composition"
            return {"appUIModel": {"hash": APP_HASH}}

    service = RuntimeDiagnosticInspectionService(
        store=store,
        thread_id="layout-thread",
        project_control=ProjectControl(),
        observations=DomainObservationContext(),
        activity=activity,
    )
    tool = create_runtime_layout_tool(service)
    rendered = asyncio.run(
        tool.ainvoke(
            {
                "instanceIds": ["sidebar-main"],
                "layoutNodeIds": ["root-row"],
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
            "nodeId": "root-row",
            "type": "row",
            "rect": {"x": 0.0, "y": 0.0, "width": 1400.0, "height": 800.0},
        }
    ]
    assert "slotPath" not in rendered
    assert activity.revision == 0

    logger.record_tool_observation(
        model_call_sequence=1,
        tool_name="inspect_runtime_layout",
        phase="read_only",
        arguments={
            "instanceIds": ["sidebar-main"],
            "layoutNodeIds": ["root-row"],
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
        "requestedLayoutNodeCount": 1,
        "returnedInstanceCount": 1,
        "returnedLayoutNodeCount": 1,
    }
    trajectory = [
        entry for entry in entries if entry["type"] == "creator_tool_observation"
    ]
    assert trajectory[-1]["data"]["arguments"] == {
        "instanceIdCount": 1,
        "layoutNodeIdCount": 1,
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
        schema["properties"]["layoutNodeIds"]["anyOf"][0]["items"]["maxLength"]
        == 200
    )
    with pytest.raises(PydanticValidationError):
        asyncio.run(tool.ainvoke({"instanceIds": ["x"] * 201}))
