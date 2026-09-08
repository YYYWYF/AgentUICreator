from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import pytest

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.domain_state import DomainObservationContext
from agent_ui_creator.project_control import ProjectControlMetrics
from agent_ui_creator.runtime_diagnostics import (
    RuntimeDiagnosticEnvelope,
    RuntimeDiagnosticInspectionService,
    RuntimeDiagnosticStore,
)


def composition(
    thread_id: str,
    app_hash: str,
    *,
    application_phase: str | None = None,
    instances: list[dict[str, str]] | None = None,
):
    return RuntimeDiagnosticEnvelope.model_validate(
        {
            "threadId": thread_id,
            "composition": {
                "schemaVersion": 1,
                "appUIModelHash": app_hash,
                "observedAt": datetime.now(timezone.utc).isoformat(),
                **(
                    {}
                    if application_phase is None
                    else {
                        "application": {
                            "phase": application_phase,
                            **(
                                {"activeGateInstanceId": "auth-gate-main"}
                                if application_phase
                                in {"resolving-gates", "blocked"}
                                else {}
                            ),
                        }
                    }
                ),
                "instances": instances or [],
            },
        }
    )


def diagnostic(thread_id: str, app_hash: str, status: str = "error"):
    return RuntimeDiagnosticEnvelope.model_validate(
        {
            "threadId": thread_id,
            "diagnostic": {
                "schemaVersion": 1,
                "kind": "plugin-render",
                "status": status,
                "appUIModelHash": app_hash,
                "occurredAt": datetime.now(timezone.utc).isoformat(),
                "pluginId": "task-status",
                "instanceId": "task-status-main",
                **(
                    {"errorMessage": "render failed"}
                    if status == "error"
                    else {}
                ),
            },
        }
    )


def test_runtime_diagnostic_store_records_forwarded_composition():
    store = RuntimeDiagnosticStore()
    envelope = RuntimeDiagnosticEnvelope.model_validate(
        {
            "threadId": "thread-1",
            "composition": {
                "schemaVersion": 1,
                "appUIModelHash": "a" * 64,
                "observedAt": "2026-09-04T00:00:00.000Z",
                "instances": [
                    {
                        "instanceId": "messages-main",
                        "pluginId": "antd-x-message-list",
                        "slotId": "conversation.messages",
                    }
                ],
            },
        }
    )

    assert store.record(envelope) == {"accepted": True}
    assert store._scopes["thread-1"].compositions[0]["instances"] == [
        {
            "instanceId": "messages-main",
            "pluginId": "antd-x-message-list",
            "slotId": "conversation.messages",
        }
    ]


def test_runtime_diagnostic_store_accepts_application_event_diagnostics():
    store = RuntimeDiagnosticStore()
    envelope = RuntimeDiagnosticEnvelope.model_validate(
        {
            "threadId": "thread-1",
            "diagnostic": {
                "schemaVersion": 1,
                "kind": "application-event-invalid-payload",
                "status": "error",
                "appUIModelHash": "a" * 64,
                "occurredAt": "2026-09-06T00:00:00.000Z",
                "eventName": "workspace.patch.applied",
                "issuePaths": ["changeId"],
                "errorMessage": "Invalid application event payload",
            },
        }
    )

    assert store.record(envelope) == {"accepted": True, "resolvedCount": 0}
    assert store._scopes["thread-1"].diagnostics[0]["eventName"] == (
        "workspace.patch.applied"
    )
    assert "pluginId" not in store._scopes["thread-1"].diagnostics[0]


def test_runtime_diagnostic_store_accepts_and_resolves_application_gate_errors():
    store = RuntimeDiagnosticStore()
    error = RuntimeDiagnosticEnvelope.model_validate(
        {
            "threadId": "thread-1",
            "diagnostic": {
                "schemaVersion": 1,
                "kind": "application-gate",
                "status": "error",
                "appUIModelHash": "a" * 64,
                "occurredAt": "2026-09-08T00:00:00.000Z",
                "pluginId": "auth-gate",
                "instanceId": "auth-gate-main",
                "errorMessage": "Session recovery failed",
            },
        }
    )
    resolved = RuntimeDiagnosticEnvelope.model_validate(
        {
            "threadId": "thread-1",
            "diagnostic": {
                "schemaVersion": 1,
                "kind": "application-gate",
                "status": "resolved",
                "appUIModelHash": "a" * 64,
                "occurredAt": "2026-09-08T00:01:00.000Z",
                "pluginId": "auth-gate",
                "instanceId": "auth-gate-main",
            },
        }
    )

    assert store.record(error) == {"accepted": True, "resolvedCount": 0}
    assert store.inspect(
        thread_id="thread-1",
        current_app_ui_model_hash="a" * 64,
    )["currentErrors"][0]["kind"] == "application-gate"
    assert store.record(resolved) == {"accepted": True, "resolvedCount": 1}
    result = store.inspect(
        thread_id="thread-1",
        current_app_ui_model_hash="a" * 64,
    )
    assert result["currentErrors"] == []
    assert result["resolvedCurrent"][0]["kind"] == "application-gate"


def test_runtime_errors_filters_current_hash():
    store = RuntimeDiagnosticStore()
    store.record(diagnostic("thread-1", "a" * 64))
    store.record(diagnostic("thread-1", "b" * 64))
    store.record(composition("thread-1", "a" * 64))

    result = store.inspect(
        thread_id="thread-1",
        current_app_ui_model_hash="a" * 64,
        include_stale=True,
    )

    assert {item["appUIModelHash"] for item in result["currentErrors"]} == {
        "a" * 64
    }
    assert {item["appUIModelHash"] for item in result["stale"]} == {"b" * 64}


def test_runtime_errors_excludes_stale_by_default():
    store = RuntimeDiagnosticStore()
    store.record(diagnostic("thread-1", "b" * 64))
    store.record(composition("thread-1", "a" * 64))

    result = store.inspect(
        thread_id="thread-1",
        current_app_ui_model_hash="a" * 64,
    )

    assert result["stale"] == []
    assert result["summary"]["staleOpenCount"] == 1


def test_runtime_verification_requires_current_composition():
    store = RuntimeDiagnosticStore()
    unavailable = store.inspect(
        thread_id="thread-1",
        current_app_ui_model_hash="a" * 64,
    )
    store.record(composition("thread-1", "b" * 64))
    stale = store.inspect(
        thread_id="thread-1",
        current_app_ui_model_hash="a" * 64,
    )
    store.record(composition("thread-1", "a" * 64))
    current = store.inspect(
        thread_id="thread-1",
        current_app_ui_model_hash="a" * 64,
    )

    assert unavailable["runtimeStatus"] == "unavailable"
    assert stale["runtimeStatus"] == "stale"
    assert current["runtimeStatus"] == "passed"


def test_runtime_evidence_before_source_mutation_is_stale(tmp_path):
    store = RuntimeDiagnosticStore()
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("runtime-freshness")
    store.record(composition("thread-1", "a" * 64))
    activity.capture_before_content("plugins/task-status/index.tsx", None)
    activity.touch("plugins/task-status/index.tsx")

    result = store.inspect(
        thread_id="thread-1",
        current_app_ui_model_hash="a" * 64,
        last_mutation_at=activity.last_mutation_at,
    )

    assert result["runtimeObserved"] is True
    assert result["runtimeStatus"] == "stale"


def test_fresh_diagnostic_does_not_refresh_stale_composition(tmp_path):
    store = RuntimeDiagnosticStore()
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("composition-freshness")
    store.record(composition("thread-1", "a" * 64))
    activity.capture_before_content("plugins/task-status/index.tsx", None)
    activity.touch("plugins/task-status/index.tsx")
    store.record(diagnostic("thread-1", "a" * 64, status="resolved"))

    result = store.inspect(
        thread_id="thread-1",
        current_app_ui_model_hash="a" * 64,
        last_mutation_at=activity.last_mutation_at,
    )

    assert result["diagnosticFresh"] is True
    assert result["compositionFresh"] is False
    assert result["runtimeStatus"] == "stale"


def test_composition_verification_stays_stale_after_fresh_unrelated_diagnostic(
    tmp_path,
):
    app_hash = "a" * 64
    store = RuntimeDiagnosticStore()
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("composition-inspection-freshness")
    store.record(composition("thread-1", app_hash))
    activity.capture_before_content("plugins/task-status/index.tsx", None)
    activity.touch("plugins/task-status/index.tsx")
    store.record(diagnostic("thread-1", app_hash, status="resolved"))

    class ProjectControl:
        metrics = ProjectControlMetrics()

        async def inspect_ui_project(self):
            return {
                "appUIModel": {"hash": app_hash},
                "pluginInstances": [
                    {
                        "id": "task-status-main",
                        "pluginId": "task-status",
                        "enabled": True,
                        "mount": {"slotId": "right.status"},
                    }
                ],
            }

    inspection = RuntimeDiagnosticInspectionService(
        store=store,
        thread_id="thread-1",
        project_control=ProjectControl(),
        observations=DomainObservationContext(),
        activity=activity,
    )

    result = asyncio.run(inspection.inspect())

    assert result["diagnosticFresh"] is True
    assert result["compositionFresh"] is False
    assert result["compositionVerified"] is False
    assert result["runtimeStatus"] == "stale"


@pytest.mark.parametrize("application_phase", ["blocked", "resolving-gates"])
def test_non_ready_application_does_not_require_workspace_composition(
    tmp_path, application_phase
):
    app_hash = "a" * 64
    store = RuntimeDiagnosticStore()
    store.record(
        composition("thread-1", app_hash, application_phase=application_phase)
    )

    class ProjectControl:
        metrics = ProjectControlMetrics()

        async def inspect_ui_project(self):
            return {
                "appUIModel": {"hash": app_hash},
                "pluginInstances": [
                    {
                        "id": "workspace-main",
                        "pluginId": "workspace",
                        "enabled": True,
                        "mount": {"slotId": "main"},
                    }
                ],
            }

    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("non-ready-application")
    inspection = RuntimeDiagnosticInspectionService(
        store=store,
        thread_id="thread-1",
        project_control=ProjectControl(),
        observations=DomainObservationContext(),
        activity=activity,
    )

    result = asyncio.run(inspection.inspect())

    assert result["application"] == {
        "phase": application_phase,
        "activeGateInstanceId": "auth-gate-main",
    }
    assert result["compositionChecks"] == []
    assert result["compositionVerified"] is True
    assert result["runtimeStatus"] == "passed"


def test_ready_application_still_requires_workspace_composition(tmp_path):
    app_hash = "a" * 64
    store = RuntimeDiagnosticStore()
    store.record(composition("thread-1", app_hash, application_phase="ready"))

    class ProjectControl:
        metrics = ProjectControlMetrics()

        async def inspect_ui_project(self):
            return {
                "appUIModel": {"hash": app_hash},
                "pluginInstances": [
                    {
                        "id": "workspace-main",
                        "pluginId": "workspace",
                        "enabled": True,
                        "mount": {"slotId": "main"},
                    }
                ],
            }

    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("ready-application")
    inspection = RuntimeDiagnosticInspectionService(
        store=store,
        thread_id="thread-1",
        project_control=ProjectControl(),
        observations=DomainObservationContext(),
        activity=activity,
    )

    result = asyncio.run(inspection.inspect())

    assert result["compositionChecks"][0]["status"] == "missing"
    assert result["compositionVerified"] is False
    assert result["runtimeStatus"] == "failed"


def test_fresh_composition_after_mutation_allows_runtime_pass(tmp_path):
    store = RuntimeDiagnosticStore()
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("fresh-composition")
    store.record(composition("thread-1", "a" * 64))
    activity.capture_before_content("plugins/task-status/index.tsx", None)
    activity.touch("plugins/task-status/index.tsx")
    store.record(composition("thread-1", "a" * 64))

    result = store.inspect(
        thread_id="thread-1",
        current_app_ui_model_hash="a" * 64,
        last_mutation_at=activity.last_mutation_at,
    )

    assert result["compositionFresh"] is True
    assert result["runtimeStatus"] == "passed"


def test_runtime_resolved_error_allows_completion(tmp_path):
    store = RuntimeDiagnosticStore()
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("runtime-resolution")
    activity.capture_before_content("plugins/task-status/index.tsx", None)
    activity.touch("plugins/task-status/index.tsx")
    store.record(composition("thread-1", "a" * 64))
    store.record(diagnostic("thread-1", "a" * 64))
    store.record(diagnostic("thread-1", "a" * 64, status="resolved"))

    result = store.inspect(
        thread_id="thread-1",
        current_app_ui_model_hash="a" * 64,
        last_mutation_at=activity.last_mutation_at,
    )

    assert result["runtimeStatus"] == "passed"
    assert result["currentErrors"] == []
    assert len(result["resolvedCurrent"]) == 1
