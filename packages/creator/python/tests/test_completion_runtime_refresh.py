from __future__ import annotations

import asyncio
import pytest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.domain_agent import CreatorDomainWriteAgent
from agent_ui_creator.domain_state import DomainObservationContext
from agent_ui_creator.operator import OperatorError
from agent_ui_creator.runtime_diagnostics import RuntimeDiagnosticEnvelope, RuntimeDiagnosticInspectionService, RuntimeDiagnosticStore


def fixture(root):
    activity = CreatorActivityRecorder(root)
    activity.begin("completion-refresh")
    file = root / "plugin.tsx"
    activity.capture_before_content("plugin.tsx", None)
    file.write_text("export {};", encoding="utf-8")
    activity.touch("plugin.tsx")
    store = RuntimeDiagnosticStore()
    operator = SimpleNamespace(
        inspect_ui_project=AsyncMock(return_value={"appUIModel": {"hash": "a" * 64, "layout": {}}, "plugins": []}),
        verify_runtime_composition=AsyncMock(return_value={"verified": True, "checks": []}),
    )
    service = RuntimeDiagnosticInspectionService(store=store, thread_id="thread", operator=operator,
        activity=activity, observations=DomainObservationContext())
    return activity, store, service, operator


def report(store, *, error=False):
    now = datetime.now(timezone.utc).isoformat()
    payload = {"threadId": "thread"}
    if error:
        payload["diagnostic"] = {"kind": "plugin-render", "status": "error", "appUIModelHash": "a" * 64,
            "occurredAt": now, "pluginId": "foo", "instanceId": "foo-main", "errorMessage": "render failed"}
    else:
        payload["composition"] = {"appUIModelHash": "a" * 64, "observedAt": now, "instances": [], "slots": []}
    store.record(RuntimeDiagnosticEnvelope.model_validate(payload))


def test_completion_reads_diagnostics_after_model_only_read_layout(tmp_path):
    activity, store, service, operator = fixture(tmp_path)
    report(store)
    asyncio.run(service.inspect_layout())
    assert service.current_result() is None
    agent = CreatorDomainWriteAgent.__new__(CreatorDomainWriteAgent)
    agent.activity = activity
    agent.completion_gate = SimpleNamespace(verification_mode="static_and_runtime", runtime=service,
        validation=SimpleNamespace(current_result=lambda: SimpleNamespace(status="passed", revision=activity.revision)))
    asyncio.run(agent._refresh_completion_runtime_evidence())
    assert service.current_result()["runtimeStatus"] == "passed"
    assert service.current_result()["compositionVerified"] is True
    operator.verify_runtime_composition.assert_awaited_once()


def test_refresh_observes_new_errors_instead_of_reusing_green_result(tmp_path):
    _, store, service, _ = fixture(tmp_path)
    report(store)
    assert asyncio.run(service.refresh_for_completion())["runtimeStatus"] == "passed"
    report(store, error=True)
    assert service.current_result() is None
    result = asyncio.run(service.refresh_for_completion())
    assert result["runtimeStatus"] == "failed"
    assert len(result["currentErrors"]) == 1


def test_no_browser_or_disconnected_host_cannot_pass(tmp_path):
    _, _, service, operator = fixture(tmp_path)
    assert asyncio.run(service.refresh_for_completion())["runtimeStatus"] == "unavailable"
    operator.inspect_ui_project.side_effect = OperatorError("OPERATOR_BUSY", "busy")
    result = asyncio.run(service.refresh_for_completion())
    assert result is None or result["runtimeStatus"] == "unavailable"


def test_new_source_revision_requires_new_browser_evidence(tmp_path):
    activity, store, service, _ = fixture(tmp_path)
    report(store)
    assert asyncio.run(service.refresh_for_completion())["runtimeStatus"] == "passed"
    activity.touch("plugin.tsx")
    assert asyncio.run(service.refresh_for_completion())["runtimeStatus"] == "stale"
    report(store)
    assert asyncio.run(service.refresh_for_completion())["runtimeStatus"] == "passed"


@pytest.mark.parametrize("mode,status,revision_offset", [
    ("static_only", "passed", 0),
    ("static_and_runtime", "failed", 0),
    ("static_and_runtime", "passed", -1),
])
def test_completion_does_not_refresh_without_current_static_pass(tmp_path, mode, status, revision_offset):
    activity, _, service, _ = fixture(tmp_path)
    service.refresh_for_completion = AsyncMock()
    agent = CreatorDomainWriteAgent.__new__(CreatorDomainWriteAgent)
    agent.activity = activity
    agent.completion_gate = SimpleNamespace(verification_mode=mode, runtime=service,
        validation=SimpleNamespace(current_result=lambda: SimpleNamespace(status=status, revision=activity.revision + revision_offset)))
    asyncio.run(agent._refresh_completion_runtime_evidence())
    service.refresh_for_completion.assert_not_awaited()
