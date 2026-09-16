import asyncio
import json
from types import SimpleNamespace

import pytest

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.app_ui_model import AppUIModelMutationMetrics
from agent_ui_creator.domain_agent.change_scope import ChangeScopeMetrics
from agent_ui_creator.model_protocol.errors import AgentNoProgressError
from agent_ui_creator.model_protocol.trace import ToolProtocolMetrics
from agent_ui_creator.observability import CreatorRunLogger, CreatorRunTelemetry
from agent_ui_creator.server import _execute_agent_run
from agent_ui_creator.streaming import CreatorEventBus


def test_failure_path_logs_bound_metrics_without_agent_result(tmp_path):
    logger = CreatorRunLogger(tmp_path)
    logger.begin(run_id="telemetry-failure", agent_mode="domain-write")
    activity = CreatorActivityRecorder(tmp_path, logger=logger)
    activity.begin("telemetry-failure")
    telemetry = CreatorRunTelemetry(
        activity=activity,
        protocol=ToolProtocolMetrics(modelCalls=24, toolCalls=6),
        project_control=SimpleNamespace(
            to_dict=lambda: {
                "requests": 3,
                "byOperation": {"inspect_app_ui_model": 2},
            }
        ),
        mutation=AppUIModelMutationMetrics(
            requests=6,
            operations=6,
            errorCategories={"workspace_integrity": 1},
        ),
        scope=ChangeScopeMetrics(
            taskChangeLayers=["composition"],
            scopeResources=["app-ui-model"],
        ),
    )

    async def fail():
        raise AgentNoProgressError("agent stopped")

    with pytest.raises(AgentNoProgressError):
        asyncio.run(
            _execute_agent_run(
                fail(),
                activity=activity,
                logger=logger,
                event_bus=CreatorEventBus(),
                telemetry=telemetry,
            )
        )

    entries = [
        json.loads(line)
        for line in logger.path.read_text(encoding="utf-8").splitlines()
    ]
    finished = [entry for entry in entries if entry["type"] == "run_finished"]
    assert len(finished) == 1
    data = finished[0]["data"]
    assert data["status"] == "error"
    assert data["modelToolMetrics"]["modelCalls"] == 24
    assert data["modelToolMetrics"]["toolCalls"] == 6
    assert data["mutationMetrics"]["mutationRequests"] == 6
    assert data["mutationMetrics"]["mutationOperations"] == 6
    assert data["changeLayerMetrics"]["executedChangeLayer"] == "composition"
    assert data["changeLayerMetrics"]["scopeResources"] == ["app-ui-model"]
