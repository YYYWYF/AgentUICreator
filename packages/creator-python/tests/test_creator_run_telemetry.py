import asyncio
import json
from types import SimpleNamespace

import pytest
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.app_ui_model import AppUIModelMutationMetrics
from agent_ui_creator.domain_agent import create_domain_write_creator_agent
from agent_ui_creator.domain_agent.change_scope import ChangeScopeMetrics
from agent_ui_creator.domain_state import CompositionFastPathMetrics, DomainObservationMetrics
from agent_ui_creator.model_protocol.errors import AgentNoProgressError
from agent_ui_creator.model_protocol.trace import ToolProtocolMetrics
from agent_ui_creator.observability import CreatorRunLogger, CreatorRunTelemetry
from agent_ui_creator.operations import CreatorActionSelectionError
from agent_ui_creator.operations.engine import (
    ProductizedOperationRun,
    ProductizedOperationToolMetrics,
)
from agent_ui_creator.operations.models import (
    CreatorActionSelection,
    CreatorOperationExecutionResult,
    CreatorOperationMetrics,
    CreatorOperationVerificationResult,
)
from agent_ui_creator.operations.snapshot import CreatorDomainSnapshotMetrics
from agent_ui_creator.project_control import ProjectControlMetrics
from agent_ui_creator.run_control import CreatorRunControlState
from agent_ui_creator.server import _execute_agent_run
from agent_ui_creator.streaming import CreatorEventBus


class NoProgressModel(FakeMessagesListChatModel):
    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        raise AgentNoProgressError("synthetic no-progress failure")


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
        composition_fast_path=CompositionFastPathMetrics(
            attempted=True,
            eligible=True,
            compositionSnapshots=1,
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
    assert data["compositionFastPath"]["attempted"] is True
    assert data["compositionFastPath"]["compositionSnapshots"] == 1
    assert "productizedOperation" not in data


def test_real_domain_write_wiring_logs_all_metrics_on_no_progress(tmp_path):
    logger = CreatorRunLogger(tmp_path)
    logger.begin(run_id="real-wiring-failure", agent_mode="domain-write")
    activity = CreatorActivityRecorder(tmp_path, logger=logger)
    activity.begin("real-wiring-failure")
    telemetry = CreatorRunTelemetry(activity=activity)
    client = SimpleNamespace(metrics=ProjectControlMetrics())
    agent = create_domain_write_creator_agent(
        model=NoProgressModel(responses=[]),
        workspace=tmp_path,
        project_control=client,
        telemetry=telemetry,
    )

    with pytest.raises(AgentNoProgressError):
        asyncio.run(
            _execute_agent_run(
                agent.run("trigger a synthetic no-progress failure"),
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
    assert "modelToolMetrics" in data
    assert "mutationMetrics" in data
    assert "changeLayerMetrics" in data
    assert "compositionFastPath" in data
    assert "projectControlMetrics" in data


def test_terminal_blocker_metrics_are_flat_and_preserve_zero_after_counts():
    state = CreatorRunControlState()
    state.observe_protocol_counts(model_calls=2, tool_calls=2)
    state.block(
        category="workspace_integrity",
        code="CREATOR_VALIDATION_WORKSPACE_INTEGRITY",
        source="validate_creator_changes",
        message="Host validation found a blocker.",
        recovery={"action": "stop_and_report_blocker"},
    )
    telemetry = CreatorRunTelemetry(
        protocol=ToolProtocolMetrics(modelCalls=2, toolCalls=2),
        run_control=state,
    )

    assert telemetry.model_tool_metrics() == {
        "modelCalls": 2,
        "toolCalls": 2,
        "terminalBlockerCount": 1,
        "terminalBlockerCode": "CREATOR_VALIDATION_WORKSPACE_INTEGRITY",
        "terminalBlockerSource": "validate_creator_changes",
        "terminalBlockerAtModelCall": 2,
        "modelCallsAfterTerminalBlocker": 0,
        "toolCallsAfterTerminalBlocker": 0,
    }


def test_action_selector_calls_do_not_overwrite_general_agent_model_calls():
    telemetry = CreatorRunTelemetry(
        protocol=ToolProtocolMetrics(modelCalls=5, toolCalls=4),
        action_selector={
            "actionSelectorCalls": 1,
            "actionSelectorRepairCalls": 0,
            "actionSelectorInvalidResponses": 0,
        },
    )

    metrics = telemetry.model_tool_metrics()

    assert metrics["modelCalls"] == 5
    assert metrics["toolCalls"] == 4
    assert metrics["actionSelectorCalls"] == 1
    assert metrics["totalModelCalls"] == 6


def test_failed_selector_only_run_logs_total_model_calls_and_protocol(tmp_path):
    logger = CreatorRunLogger(tmp_path)
    logger.begin(run_id="selector-only-failure", agent_mode="domain-write")
    activity = CreatorActivityRecorder(tmp_path, logger=logger)
    activity.begin("selector-only-failure")
    telemetry = CreatorRunTelemetry(
        activity=activity,
        action_selector={
            "actionSelectorProtocol": "choice-text-v1",
            "actionSelectorCalls": 2,
            "actionSelectorRepairCalls": 1,
            "actionSelectorInvalidResponses": 2,
            "actionSelectorRepairReasonCode": "protocol_parse_failed",
        },
    )

    async def fail():
        raise CreatorActionSelectionError("Invalid selector response")

    with pytest.raises(CreatorActionSelectionError):
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
    data = next(entry["data"] for entry in entries if entry["type"] == "run_finished")
    assert data["modelToolMetrics"]["totalModelCalls"] == 2
    assert data["modelToolMetrics"]["actionSelectorProtocol"] == "choice-text-v1"
    assert data["actionSelector"]["actionSelectorProtocol"] == "choice-text-v1"


def test_successful_productized_repair_reason_is_logged_in_run_finished(tmp_path):
    logger = CreatorRunLogger(tmp_path)
    logger.begin(run_id="selector-repaired-success", agent_mode="domain-write")
    activity = CreatorActivityRecorder(tmp_path, logger=logger)
    activity.begin("selector-repaired-success")
    result = ProductizedOperationRun(
        text="Completed Productized operation.",
        metrics=ProductizedOperationToolMetrics(
            modelCalls=2,
            actionSelectorCalls=2,
            actionSelectorRepairCalls=1,
            actionSelectorInvalidResponses=1,
            totalModelCalls=2,
        ),
        project_control=ProjectControlMetrics(),
        repeated_project_control_reads=0,
        domain_observations=DomainObservationMetrics(),
        app_ui_model_mutations=AppUIModelMutationMetrics(),
        snapshot_metrics=CreatorDomainSnapshotMetrics(),
        operation_result=None,
        validation_metrics={},
        completion="success",
        action_selector_metrics={
            "actionSelectorCalls": 2,
            "actionSelectorRepairCalls": 1,
            "actionSelectorInvalidResponses": 1,
            "actionSelectorRepairReasonCode": "unknown_action_id",
            "actionSelectorRepairReason": (
                "The selected actionId is not one of the supplied current Action Candidates."
            ),
        },
    )

    async def finish_run():
        return result

    asyncio.run(
        _execute_agent_run(
            finish_run(),
            activity=activity,
            logger=logger,
            event_bus=CreatorEventBus(),
        )
    )

    entries = [
        json.loads(line)
        for line in logger.path.read_text(encoding="utf-8").splitlines()
    ]
    finished = [entry for entry in entries if entry["type"] == "run_finished"]
    assert len(finished) == 1
    data = finished[0]["data"]
    assert data["status"] == "success"
    assert data["actionSelector"]["actionSelectorRepairReasonCode"] == (
        "unknown_action_id"
    )
    assert data["modelToolMetrics"]["totalModelCalls"] == 2


def _finish_productized_run(
    tmp_path,
    *,
    completion: str,
    operation_result: CreatorOperationExecutionResult | None,
    selection: CreatorActionSelection | None = None,
) -> dict[str, object]:
    logger = CreatorRunLogger(tmp_path)
    logger.begin(run_id="productized-verification", agent_mode="domain-write")
    activity = CreatorActivityRecorder(tmp_path, logger=logger)
    activity.begin("productized-verification")
    result = ProductizedOperationRun(
        text="Productized operation finished.",
        metrics=ProductizedOperationToolMetrics(modelCalls=0),
        project_control=ProjectControlMetrics(),
        repeated_project_control_reads=0,
        domain_observations=DomainObservationMetrics(),
        app_ui_model_mutations=AppUIModelMutationMetrics(),
        snapshot_metrics=CreatorDomainSnapshotMetrics(),
        operation_result=operation_result,
        validation_metrics={"validationMode": "delta", "newTypecheckDiagnostics": 0},
        completion=completion,
        selection=selection,
    )

    async def finish_run():
        return result

    asyncio.run(
        _execute_agent_run(
            finish_run(),
            activity=activity,
            logger=logger,
            event_bus=CreatorEventBus(),
        )
    )
    entries = [
        json.loads(line)
        for line in logger.path.read_text(encoding="utf-8").splitlines()
    ]
    return next(entry["data"] for entry in entries if entry["type"] == "run_finished")


@pytest.mark.parametrize(
    ("status", "runtime_status", "freshness_attempts", "freshness_wait_ms"),
    [
        ("committed_unverified", "stale", 3, 1000),
        ("committed_unverified", "unavailable", 3, 1000),
        ("success", "passed", 1, 0),
    ],
)
def test_productized_verification_is_persisted_in_run_finished(
    tmp_path, status, runtime_status, freshness_attempts, freshness_wait_ms
):
    operation_result = CreatorOperationExecutionResult(
        operation="add_existing_plugin",
        status=status,
        pluginId="conversation-thread-list",
        instanceId="conversation-thread-list-main",
        mutationChanged=True,
        verification=CreatorOperationVerificationResult(
            staticStatus="passed",
            runtimeStatus=runtime_status,
            runtimeFreshnessAttempts=freshness_attempts,
            runtimeFreshnessWaitMs=freshness_wait_ms,
        ),
        metrics=CreatorOperationMetrics(
            operationDurationMs=1,
            executionModelCalls=0,
            mutationAttempts=1,
            snapshotRefreshes=0,
            verificationRuntimeFreshnessAttempts=freshness_attempts,
        ),
    )

    data = _finish_productized_run(
        tmp_path, completion=status, operation_result=operation_result
    )

    assert data["outcome"] == status
    assert data["validationMetrics"] == {
        "validationMode": "delta",
        "newTypecheckDiagnostics": 0,
    }
    productized = data["productizedOperation"]
    assert productized == operation_result.model_dump(mode="json", exclude_none=True)
    assert productized["status"] == status
    assert productized["verification"]["staticStatus"] == "passed"
    assert productized["verification"]["runtimeStatus"] == runtime_status
    assert productized["verification"]["runtimeFreshnessAttempts"] == freshness_attempts
    assert productized["verification"]["runtimeFreshnessWaitMs"] == freshness_wait_ms


def test_already_satisfied_productized_operation_is_persisted_without_verification(
    tmp_path,
):
    operation_result = CreatorOperationExecutionResult(
        operation="add_existing_plugin",
        status="already_satisfied",
        pluginId="conversation-thread-list",
        instanceId="conversation-thread-list-main",
        metrics=CreatorOperationMetrics(
            operationDurationMs=1,
            executionModelCalls=0,
            mutationAttempts=0,
            snapshotRefreshes=0,
            verificationRuntimeFreshnessAttempts=0,
        ),
    )

    data = _finish_productized_run(
        tmp_path,
        completion="already_satisfied",
        operation_result=operation_result,
    )

    assert data["outcome"] == "already_satisfied"
    assert data["productizedOperation"]["status"] == "already_satisfied"
    assert "verification" not in data["productizedOperation"]


@pytest.mark.parametrize("decision", ["needs_clarification", "unsupported_product_action"])
def test_terminal_productized_run_omits_operation_result(tmp_path, decision):
    selection = CreatorActionSelection(
        decision=decision,
        clarificationQuestion="Which feature do you mean?"
        if decision == "needs_clarification"
        else None,
    )

    data = _finish_productized_run(
        tmp_path,
        completion="blocked",
        operation_result=None,
        selection=selection,
    )

    assert data["outcome"] == "blocked"
    assert "productizedOperation" not in data


def test_action_selector_failure_details_are_retained_in_run_finished(tmp_path):
    logger = CreatorRunLogger(tmp_path)
    logger.begin(run_id="selector-failure", agent_mode="domain-write")
    error = CreatorActionSelectionError(
        "Creator Action Selector returned an invalid selection.",
        {
            "attempts": 2,
            "reasonCode": "unknown_action_id",
            "reason": "The selected actionId is not one of the supplied current Action Candidates.",
            "returnedActionId": "act_invented",
            "candidateCount": 10,
        },
    )

    logger.finish("error", error=error)

    entries = [
        json.loads(line)
        for line in logger.path.read_text(encoding="utf-8").splitlines()
    ]
    finished = [entry for entry in entries if entry["type"] == "run_finished"]
    assert len(finished) == 1
    data = finished[0]["data"]
    assert data["error"] == "Creator Action Selector returned an invalid selection."
    assert data["errorDetails"] == {
        "code": "ACTION_SELECTION_FAILED",
        "details": {
            "attempts": 2,
            "reasonCode": "unknown_action_id",
            "reason": "The selected actionId is not one of the supplied current Action Candidates.",
            "returnedActionId": "act_invented",
            "candidateCount": 10,
        },
    }
