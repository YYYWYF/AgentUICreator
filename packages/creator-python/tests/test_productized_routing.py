from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from agent_ui_creator.app_ui_model import AppUIModelMutationMetrics
from agent_ui_creator.config import CreatorServerSettings
from agent_ui_creator.domain_state import DomainObservationContext, DomainObservationMetrics
from agent_ui_creator.operations import (
    AddDefaultActionEffect,
    CreatorActionCandidate,
    CreatorActionCatalogSnapshot,
    CreatorActionSelection,
    CreatorActionSelectionError,
    CreatorActionSelectorMetrics,
    CreatorAuthoringTargetBinding,
    CreatorAuthoringTargetCandidate,
    CreatorAuthoringTargetCatalogSnapshot,
    CreatorActionTarget,
    CreatorDomainSnapshot,
    CreatorDomainSnapshotError,
    CreatorOperationExecutionResult,
    CreatorOperationExecutionStatus,
    CreatorOperationMetrics,
    PluginCapabilityIndex,
    PendingCreatorClarificationStore,
    RemoveActionEffect,
    WorkspaceRegionActionEffect,
    present_creator_action_selection,
)
from agent_ui_creator.operations.engine import (
    CreatorResolveResult,
    ProductizedOperationEngine,
    ProductizedOperationRun,
    ProductizedOperationToolMetrics,
)
from agent_ui_creator.model_settings import CreatorSelectorModelSettings
from agent_ui_creator.operations.snapshot import CreatorDomainSnapshotMetrics
from agent_ui_creator.observability import CreatorRunTelemetry
from agent_ui_creator.project_control import ProjectControlMetrics
from agent_ui_creator.server import create_app
from agent_ui_creator.streaming import (
    CreatorEventBus,
    CreatorStepFinished,
    CreatorStepStarted,
)


_OBSERVATION_COVERAGE = (
    "composition.model",
    "composition.layout",
    "composition.slots",
    "composition.instances",
    "capability.inventory",
    "capability.composition-summary",
    "creator.actions",
)


class _Selector:
    def __init__(
        self,
        selection: CreatorActionSelection | BaseException,
        *,
        metrics: CreatorActionSelectorMetrics | None = None,
    ) -> None:
        self.selection = selection
        self.calls = 0
        self.messages: list[tuple[str, object]] = []
        self.requested_model = None
        self.selector_settings = CreatorSelectorModelSettings()
        self.metrics = metrics or CreatorActionSelectorMetrics(
            modelCalls=1,
            repairCalls=0,
            invalidResponses=0,
            durationMs=10,
            candidateCount=3,
            contextCharacters=100,
        )

    async def select(
        self,
        message: str,
        context: object,
        *,
        clarification_context: object | None = None,
    ):
        self.calls += 1
        self.messages.append((message, clarification_context or context))
        if isinstance(self.selection, BaseException):
            raise self.selection
        return self.selection


class _ActionPlaybook:
    def __init__(
        self,
        result: CreatorOperationExecutionResult | None = None,
        error: BaseException | None = None,
    ) -> None:
        self.result = result
        self.error = error
        self.calls: list[tuple[CreatorDomainSnapshot, CreatorActionCandidate]] = []

    async def execute(
        self,
        snapshot: CreatorDomainSnapshot,
        candidate: CreatorActionCandidate,
    ) -> CreatorOperationExecutionResult:
        self.calls.append((snapshot, candidate))
        if self.error is not None:
            raise self.error
        assert self.result is not None
        return self.result


class _RetryingActionPlaybook(_ActionPlaybook):
    def __init__(self, result: CreatorOperationExecutionResult) -> None:
        super().__init__(result)
        self.mutation_action_ids: list[str] = []
        self.snapshot_refreshes = 0

    async def execute(
        self,
        snapshot: CreatorDomainSnapshot,
        candidate: CreatorActionCandidate,
    ) -> CreatorOperationExecutionResult:
        self.calls.append((snapshot, candidate))
        self.mutation_action_ids.extend([candidate.actionId, candidate.actionId])
        self.snapshot_refreshes = 1
        assert self.result is not None
        return self.result


def _candidate(
    kind: str,
    *,
    action_id: str | None = None,
    status: str = "ready",
    region: str = "right",
) -> CreatorActionCandidate:
    if kind == "add_existing_plugin":
        effect = AddDefaultActionEffect(type="add_default")
    elif kind == "remove_plugin":
        effect = RemoveActionEffect(type="remove")
    elif kind == "move_plugin":
        effect = WorkspaceRegionActionEffect(type="workspace_region", region=region)
    else:
        raise AssertionError(f"unsupported test Action kind: {kind}")
    action_id = action_id or f"act_history_{kind}"
    return CreatorActionCandidate(
        actionId=action_id,
        kind=kind,  # type: ignore[arg-type]
        status=status,  # type: ignore[arg-type]
        label="Move History to Workspace.Right",
        description="Move the History Plugin to the semantic Workspace.Right Region.",
        target=CreatorActionTarget(
            pluginId="conversation-thread-list",
            pluginName="Conversation Thread List",
            instanceId="conversation-thread-list-main",
        ),
        effect=effect,
    )


def _candidates() -> list[CreatorActionCandidate]:
    return [
        _candidate("add_existing_plugin", action_id="act_history_add"),
        _candidate("remove_plugin", action_id="act_history_remove"),
        _candidate("move_plugin", action_id="act_history_right"),
    ]


class _SnapshotProvider:
    def __init__(
        self,
        candidates: list[CreatorActionCandidate] | None = None,
        *,
        error: BaseException | None = None,
        authoring_target_catalog: CreatorAuthoringTargetCatalogSnapshot | None = None,
    ) -> None:
        self.candidates = candidates or _candidates()
        self.error = error
        self.authoring_target_catalog = authoring_target_catalog
        self.metrics = CreatorDomainSnapshotMetrics()
        self.build_calls = 0

    async def build(self) -> CreatorDomainSnapshot:
        self.build_calls += 1
        if self.error is not None:
            raise self.error
        return CreatorDomainSnapshot(
            raw={},
            app_ui_model_hash="a" * 64,
            capability_catalog_revision="b" * 64,
            observation_coverage=_OBSERVATION_COVERAGE,
            plugin_index=PluginCapabilityIndex(),
            action_catalog=CreatorActionCatalogSnapshot(
                revision="c" * 64,
                candidates=self.candidates,
            ),
            authoring_target_catalog=(
                self.authoring_target_catalog
                if self.authoring_target_catalog is not None
                else CreatorAuthoringTargetCatalogSnapshot()
            ),
        )


def _operation_result(
    status: CreatorOperationExecutionStatus = "success",
    operation: str = "add_existing_plugin",
    *,
    mutation_attempts: int = 1,
    snapshot_refreshes: int = 0,
) -> CreatorOperationExecutionResult:
    mutation_changed = status != "already_satisfied"
    return CreatorOperationExecutionResult(
        operation=operation,  # type: ignore[arg-type]
        status=status,
        pluginId="conversation-thread-list",
        instanceId="conversation-thread-list-main",
        mutationChanged=mutation_changed,
        mutationRevision=1 if mutation_changed else None,
        metrics=CreatorOperationMetrics(
            operationDurationMs=1,
            executionModelCalls=0,
            mutationAttempts=mutation_attempts if mutation_changed else 0,
            snapshotRefreshes=snapshot_refreshes,
            verificationRuntimeFreshnessAttempts=0,
        ),
    )


def _engine(
    selection: CreatorActionSelection | BaseException,
    *,
    playbook: _ActionPlaybook | None = None,
    event_sink: CreatorEventBus | None = None,
    candidates: list[CreatorActionCandidate] | None = None,
    snapshot_provider: _SnapshotProvider | None = None,
    selector_metrics: CreatorActionSelectorMetrics | None = None,
    pending_clarifications: PendingCreatorClarificationStore | None = None,
    thread_id: str = "thread-1",
) -> tuple[ProductizedOperationEngine, _Selector, _ActionPlaybook, CreatorRunTelemetry]:
    telemetry = CreatorRunTelemetry()
    selector = _Selector(selection, metrics=selector_metrics)
    action_playbook = playbook or _ActionPlaybook(
        _operation_result(operation="add_existing_plugin")
    )
    engine = object.__new__(ProductizedOperationEngine)
    engine.activity = SimpleNamespace(
        revision=0,
        logger=None,
        record_semantic_noop=lambda **_kwargs: None,
    )
    engine.thread_id = thread_id
    engine.pending_clarifications = pending_clarifications or PendingCreatorClarificationStore()
    engine.snapshot_provider = snapshot_provider or _SnapshotProvider(candidates)
    engine.observations = DomainObservationContext()
    engine.selector = selector
    engine.action_playbook = action_playbook
    engine.project_control = SimpleNamespace(metrics=ProjectControlMetrics())
    engine.mutation_service = SimpleNamespace(metrics=AppUIModelMutationMetrics())
    engine.validation = SimpleNamespace(metrics=lambda: {})
    engine.telemetry = telemetry
    if event_sink is not None:
        engine.event_sink = event_sink
    return engine, selector, action_playbook, telemetry


def _selection_for(candidate: CreatorActionCandidate) -> CreatorActionSelection:
    return CreatorActionSelection(decision="select_action", actionId=candidate.actionId)


def _authoring_target_snapshot(
    kind: str,
) -> tuple[CreatorActionSelection, _SnapshotProvider, str]:
    if kind == "application_config":
        target_id = "conversation.starter-suggestions"
        target = CreatorAuthoringTargetCandidate(
            targetId=target_id,
            kind="application_config",
            name="Conversation starter suggestions",
            description="Application-owned starter questions.",
            intents=["change starter questions"],
            relatedPluginIds=["conversation-suggestions"],
        )
        binding = CreatorAuthoringTargetBinding(
            targetId=target_id,
            kind="application_config",
            ownerPath="agent-ui/conversation/config/conversation-runtime-config.ts",
            relatedPluginIds=["conversation-suggestions"],
        )
    else:
        target_id = "plugin-source:conversation-suggestions"
        target = CreatorAuthoringTargetCandidate(
            targetId=target_id,
            kind="plugin_source",
            name="Conversation Suggestions Plugin implementation",
            description="Modify rendering, styling, interaction, or implementation behavior.",
            intents=["change Conversation Suggestions styling"],
            relatedPluginIds=["conversation-suggestions"],
        )
        binding = CreatorAuthoringTargetBinding(
            targetId=target_id,
            kind="plugin_source",
            ownerRoot="plugins/conversation-suggestions",
            definitionPath="plugins/conversation-suggestions/definition.ts",
            manifestPath="plugins/conversation-suggestions/manifest.json",
            pluginId="conversation-suggestions",
            relatedPluginIds=["conversation-suggestions"],
        )
    return (
        CreatorActionSelection(decision="select_intent", targetId=target_id),
        _SnapshotProvider(
            authoring_target_catalog=CreatorAuthoringTargetCatalogSnapshot(
                revision="d" * 64,
                candidates=[target],
                bindings=[binding],
            )
        ),
        target_id,
    )


@pytest.mark.parametrize("kind", ["application_config", "plugin_source"])
def test_scoped_authoring_routes_emit_owner_bound_telemetry(kind):
    selection, snapshot_provider, target_id = _authoring_target_snapshot(kind)
    engine, selector, action_playbook, telemetry = _engine(
        selection,
        snapshot_provider=snapshot_provider,
    )

    result = asyncio.run(engine.run([{"role": "user", "content": "change"}]))

    assert isinstance(result, CreatorResolveResult)
    assert result.route == "scoped_general_handoff"
    assert result.handoff is not None
    assert result.handoff.targetId == target_id
    assert selector.calls == 1
    assert action_playbook.calls == []
    assert telemetry.operation_route["route"] == kind
    assert telemetry.operation_route["generalAgent"] is True
    assert telemetry.operation_route["ownerScopedHandoff"] is True
    assert telemetry.operation_route["productized"] is False
    assert telemetry.operation_route["targetId"] == target_id
    assert telemetry.selected_creator_intent["targetId"] == target_id
    assert telemetry.authoring_handoff["targetId"] == target_id


@pytest.mark.parametrize("kind", ["add_existing_plugin", "remove_plugin", "move_plugin"])
def test_productized_routing_uses_selector_and_generic_action_playbook(kind):
    candidate = _candidate(kind)
    selection = _selection_for(candidate)
    operation_result = _operation_result(operation=kind)
    playbook = _ActionPlaybook(operation_result)
    engine, selector, action_playbook, telemetry = _engine(
        selection,
        playbook=playbook,
        candidates=[candidate],
    )

    result = asyncio.run(engine.run([{"role": "user", "content": "change"}]))

    assert isinstance(result, ProductizedOperationRun)
    assert result.operation_result is operation_result
    assert selector.calls == 1
    assert len(action_playbook.calls) == 1
    assert action_playbook.calls[0][1] is candidate
    assert result.selection is selection
    assert result.selected_action is candidate
    assert result.metrics.modelCalls == 1
    assert result.metrics.actionSelectorCalls == 1
    assert result.metrics.totalModelCalls == 1
    assert result.metrics.toolCalls == 0
    assert result.metrics.deepAgentCalls == 0
    assert telemetry.operation_route["route"] == "productized"
    assert result.action_selector_metrics["actionSelectorProtocol"] == "choice-text-v1"
    assert telemetry.operation_route["productized"] is True
    assert telemetry.operation_route["generalAgent"] is False
    assert telemetry.operation_route["clarification"] is False
    assert telemetry.operation_route["unsupported"] is False
    assert "fallback" not in telemetry.operation_route
    if kind == "move_plugin":
        assert candidate.effect.type == "workspace_region"
        assert candidate.effect.region == "right"


def test_engine_exposes_only_selector_and_action_playbook():
    candidate = _candidate("add_existing_plugin")
    playbook = _ActionPlaybook(_operation_result(operation="add_existing_plugin"))
    engine, _selector, _action_playbook, _telemetry = _engine(
        _selection_for(candidate),
        playbook=playbook,
        candidates=[candidate],
    )

    result = asyncio.run(engine.run([{"role": "user", "content": "change"}]))

    assert isinstance(result, ProductizedOperationRun)
    assert hasattr(engine, "selector")
    assert hasattr(engine, "action_playbook")
    assert not hasattr(engine, "resolver")
    assert not hasattr(engine, "registry")
    assert len(playbook.calls) == 1


def test_operations_public_api_excludes_retired_pipeline():
    import agent_ui_creator.operations as operations

    for name in (
        "CreatorOperationResolver",
        "CreatorOperationRegistry",
        "CreatorOperationResolution",
        "AddExistingPluginPlaybook",
        "RemovePluginPlaybook",
        "MovePluginPlaybook",
    ):
        assert not hasattr(operations, name)


def test_general_change_is_the_only_decision_that_returns_none():
    engine, selector, action_playbook, telemetry = _engine(
        CreatorActionSelection(decision="general_change")
    )

    result = asyncio.run(engine.run([{"role": "user", "content": "支持标题模糊搜索"}]))

    assert result is None
    assert selector.calls == 1
    assert action_playbook.calls == []
    assert engine.mutation_service.metrics.operations == 0
    assert telemetry.operation_route["route"] == "general-agent"
    assert telemetry.operation_route["generalAgent"] is True
    assert telemetry.operation_route["productized"] is False
    assert "fallback" not in telemetry.operation_route


def test_repaired_general_change_preserves_selector_reason_and_model_totals():
    engine, _selector, _action_playbook, telemetry = _engine(
        CreatorActionSelection(decision="general_change"),
        selector_metrics=CreatorActionSelectorMetrics(
            modelCalls=2,
            repairCalls=1,
            invalidResponses=1,
            repairReasonCode="unknown_action_id",
            repairReason=(
                "The selected actionId is not one of the supplied current Action Candidates."
            ),
        ),
    )
    telemetry.protocol = {"modelCalls": 3, "toolCalls": 1}

    result = asyncio.run(engine.run([{"role": "user", "content": "支持标题模糊搜索"}]))

    assert result is None
    assert telemetry.action_selector is not None
    assert telemetry.action_selector["actionSelectorRepairReasonCode"] == (
        "unknown_action_id"
    )
    metrics = telemetry.model_tool_metrics()
    assert metrics["modelCalls"] == 3
    assert metrics["actionSelectorCalls"] == 2
    assert metrics["totalModelCalls"] == 5


def test_needs_clarification_finishes_without_playbook_or_general_agent_route():
    question = "你要删除历史会话，还是当前会话面板？"
    event_bus = CreatorEventBus()
    engine, selector, action_playbook, telemetry = _engine(
        CreatorActionSelection(
            decision="needs_clarification",
            clarificationQuestion=question,
        ),
        event_sink=event_bus,
    )

    async def scenario():
        result = await engine.run([{"role": "user", "content": "删除那个会话"}])
        events = [await event_bus.next_event() for _ in range(4)]
        event_bus.close()
        return result, events

    result, events = asyncio.run(scenario())

    assert isinstance(result, ProductizedOperationRun)
    assert result.text == question
    assert result.operation_result is None
    assert result.completion == "success"
    assert selector.calls == 1
    assert action_playbook.calls == []
    assert result.metrics.to_dict() == {
        "modelCalls": 1,
        "actionSelectorCalls": 1,
        "actionSelectorRepairCalls": 0,
        "actionSelectorInvalidResponses": 0,
        "actionSelectorDurationMs": 10,
        "actionSelectorCandidateCount": 3,
        "actionSelectorContextCharacters": 100,
        "totalModelCalls": 1,
        "toolCalls": 0,
        "validToolCalls": 0,
        "invalidToolCalls": 0,
        "deepAgentCalls": 0,
    }
    assert [event.name for event in events] == [
        "creator.grounding",
        "creator.grounding",
        "creator.resolve",
        "creator.resolve",
    ]
    assert telemetry.operation_route["route"] == "clarification"
    assert telemetry.operation_route["clarification"] is True
    assert telemetry.operation_route["generalAgent"] is False


def test_clarification_continuation_is_thread_bound_and_does_not_require_punctuation():
    pending_clarifications = PendingCreatorClarificationStore()
    first_engine, _first_selector, first_playbook, _first_telemetry = _engine(
        CreatorActionSelection(
            decision="needs_clarification",
            clarificationQuestion="你是只想去掉界面面板，还是也要关闭底层能力",
        ),
        pending_clarifications=pending_clarifications,
    )

    first_result = asyncio.run(first_engine.run([
        {"role": "user", "content": "我不要历史会话管理功能"},
    ]))

    assert isinstance(first_result, ProductizedOperationRun)
    assert first_playbook.calls == []
    assert pending_clarifications.peek("thread-1") is not None

    remove_candidate = _candidate("remove_plugin")
    second_engine, second_selector, second_playbook, _second_telemetry = _engine(
        _selection_for(remove_candidate),
        playbook=_ActionPlaybook(_operation_result(operation="remove_plugin")),
        candidates=[remove_candidate],
        pending_clarifications=pending_clarifications,
    )
    second_result = asyncio.run(second_engine.run([
        {"role": "user", "content": "只去掉面板"},
    ]))

    assert isinstance(second_result, ProductizedOperationRun)
    assert second_result.selected_action is remove_candidate
    assert len(second_playbook.calls) == 1
    assert second_selector.messages[0][1] == {
        "previousUserRequest": "我不要历史会话管理功能",
        "previousCreatorClarification": "你是只想去掉界面面板，还是也要关闭底层能力",
    }
    assert pending_clarifications.peek("thread-1") is None


def test_unsupported_product_action_is_blocked_without_general_agent_route():
    engine, selector, action_playbook, telemetry = _engine(
        CreatorActionSelection(decision="unsupported_product_action")
    )

    result = asyncio.run(engine.run([{"role": "user", "content": "把 History 放到中间"}]))

    assert isinstance(result, ProductizedOperationRun)
    assert result.completion == "blocked"
    assert result.blocker == {
        "code": "PRODUCT_ACTION_UNSUPPORTED",
        "message": "当前请求没有可安全执行的产品化操作。",
    }
    assert result.operation_result is None
    assert selector.calls == 1
    assert action_playbook.calls == []
    assert telemetry.operation_route["route"] == "unsupported"
    assert telemetry.operation_route["unsupported"] is True
    assert telemetry.operation_route["generalAgent"] is False
    assert "fallback" not in telemetry.operation_route


def test_selector_failure_does_not_route_to_general_agent():
    engine, selector, action_playbook, _telemetry = _engine(
        CreatorActionSelectionError("synthetic selector failure")
    )

    with pytest.raises(CreatorActionSelectionError) as raised:
        asyncio.run(engine.run([{"role": "user", "content": "change"}]))

    assert raised.value.code == "ACTION_SELECTION_FAILED"
    assert selector.calls == 1
    assert action_playbook.calls == []


def test_snapshot_failure_does_not_call_selector_or_action_playbook():
    provider = _SnapshotProvider(
        error=CreatorDomainSnapshotError(
            "DOMAIN_SNAPSHOT_INVALID",
            "synthetic invalid snapshot",
        )
    )
    engine, selector, action_playbook, _telemetry = _engine(
        CreatorActionSelection(decision="general_change"),
        snapshot_provider=provider,
    )

    with pytest.raises(CreatorDomainSnapshotError) as raised:
        asyncio.run(engine.run([{"role": "user", "content": "change"}]))

    assert raised.value.code == "DOMAIN_SNAPSHOT_INVALID"
    assert selector.calls == 0
    assert action_playbook.calls == []


def test_action_execution_failure_propagates_without_general_agent_route():
    candidate = _candidate("remove_plugin")
    playbook = _ActionPlaybook(error=RuntimeError("PRODUCT_OPERATION_STALE"))
    engine, selector, action_playbook, _telemetry = _engine(
        _selection_for(candidate),
        playbook=playbook,
        candidates=[candidate],
    )

    with pytest.raises(RuntimeError, match="PRODUCT_OPERATION_STALE"):
        asyncio.run(engine.run([{"role": "user", "content": "删除历史会话"}]))

    assert selector.calls == 1
    assert len(action_playbook.calls) == 1


def test_selected_action_missing_from_snapshot_fails_closed():
    candidate = _candidate("move_plugin", action_id="act_history_right")
    engine, selector, action_playbook, _telemetry = _engine(
        _selection_for(candidate),
        candidates=[_candidate("move_plugin", action_id="act_other")],
    )

    with pytest.raises(CreatorActionSelectionError) as raised:
        asyncio.run(engine.run([{"role": "user", "content": "把会话管理移到右边"}]))

    assert raised.value.code == "ACTION_SELECTION_FAILED"
    assert selector.calls == 1
    assert action_playbook.calls == []


def test_selector_repair_metrics_are_authoritative_and_no_execution_model_is_used():
    candidate = _candidate("move_plugin")
    selector_metrics = CreatorActionSelectorMetrics(
        modelCalls=2,
        repairCalls=1,
        invalidResponses=1,
        durationMs=20,
        candidateCount=3,
        contextCharacters=900,
        repairReasonCode="unknown_action_id",
        repairReason=(
            "The selected actionId is not one of the supplied current Action Candidates."
        ),
    )
    operation_result = _operation_result(operation="move_plugin")
    engine, _selector, _action_playbook, _telemetry = _engine(
        _selection_for(candidate),
        playbook=_ActionPlaybook(operation_result),
        candidates=[candidate],
        selector_metrics=selector_metrics,
    )

    result = asyncio.run(engine.run([{"role": "user", "content": "把会话管理放到右边"}]))

    assert isinstance(result, ProductizedOperationRun)
    assert result.metrics.modelCalls == 2
    assert result.metrics.actionSelectorCalls == 2
    assert result.metrics.actionSelectorRepairCalls == 1
    assert result.metrics.actionSelectorInvalidResponses == 1
    assert result.action_selector_metrics["actionSelectorRepairReasonCode"] == (
        "unknown_action_id"
    )
    assert result.action_selector_metrics["actionSelectorRepairReason"] == (
        "The selected actionId is not one of the supplied current Action Candidates."
    )
    assert result.metrics.totalModelCalls == 2
    assert result.metrics.toolCalls == 0
    assert result.metrics.deepAgentCalls == 0
    assert result.operation_result.metrics.executionModelCalls == 0


def test_stale_retry_keeps_one_selector_call_and_reports_playbook_retry_metrics():
    candidate = _candidate("move_plugin")
    operation_result = _operation_result(
        operation="move_plugin",
        mutation_attempts=2,
        snapshot_refreshes=1,
    )
    playbook = _RetryingActionPlaybook(operation_result)
    engine, selector, action_playbook, _telemetry = _engine(
        _selection_for(candidate),
        playbook=playbook,
        candidates=[candidate],
    )

    result = asyncio.run(engine.run([{"role": "user", "content": "把会话管理移到最右边"}]))

    assert isinstance(result, ProductizedOperationRun)
    assert selector.calls == 1
    assert len(action_playbook.calls) == 1
    assert action_playbook.mutation_action_ids == [
        "act_history_move_plugin",
        "act_history_move_plugin",
    ]
    assert action_playbook.snapshot_refreshes == 1
    assert result.operation_result.metrics.mutationAttempts == 2
    assert result.operation_result.metrics.snapshotRefreshes == 1


def test_engine_publishes_resolve_before_productized_execution():
    candidate = _candidate("remove_plugin")
    event_bus = CreatorEventBus()
    engine, _selector, _action_playbook, _telemetry = _engine(
        _selection_for(candidate),
        playbook=_ActionPlaybook(_operation_result(operation="remove_plugin")),
        candidates=[candidate],
        event_sink=event_bus,
    )

    async def scenario():
        result = await engine.run([{"role": "user", "content": "删除历史会话"}])
        events = [await event_bus.next_event() for _ in range(6)]
        event_bus.close()
        return result, events

    result, events = asyncio.run(scenario())

    assert isinstance(result, ProductizedOperationRun)
    assert [type(event) for event in events] == [
        CreatorStepStarted,
        CreatorStepFinished,
        CreatorStepStarted,
        CreatorStepFinished,
        CreatorStepStarted,
        CreatorStepFinished,
    ]
    assert [event.name for event in events] == [
        "creator.grounding",
        "creator.grounding",
        "creator.resolve",
        "creator.resolve",
        "creator.productized-operation",
        "creator.productized-operation",
    ]
    resolve_finished = events[3]
    assert isinstance(resolve_finished, CreatorStepFinished)
    assert resolve_finished.metadata is not None
    assert resolve_finished.metadata["creator"] == {
        "phase": "understanding",
        "status": "success",
        "actionSelectorProtocol": "choice-text-v1",
        "actionSelectorModel": None,
        "actionSelectorRequestedMaxTokens": 512,
        "actionSelectorRequestedReasoningEffort": None,
        "decision": "select_action",
        "displayIntent": "移除 Conversation Thread List",
        "intent": "remove_plugin",
        "targetPluginIds": ["conversation-thread-list"],
        "targetInstanceIds": ["conversation-thread-list-main"],
        "route": "productized",
        "actionId": "act_history_remove_plugin",
        "actionKind": "remove_plugin",
        "actionStatus": "ready",
        "effectType": "remove",
        "modelCalls": 1,
        "repairCalls": 0,
        "invalidResponses": 0,
        "durationMs": 10,
        "candidateCount": 3,
        "contextCharacters": 100,
        "actionSelectorCalls": 1,
        "actionSelectorRepairCalls": 0,
        "actionSelectorInvalidResponses": 0,
        "actionSelectorDurationMs": 10,
        "actionSelectorCandidateCount": 3,
        "actionSelectorContextCharacters": 100,
    }
    resolve_finished_index = next(
        index
        for index, event in enumerate(events)
        if isinstance(event, CreatorStepFinished) and event.name == "creator.resolve"
    )
    productized_started_index = next(
        index
        for index, event in enumerate(events)
        if isinstance(event, CreatorStepStarted)
        and event.name == "creator.productized-operation"
    )
    assert resolve_finished_index < productized_started_index


def _server_productized_result() -> ProductizedOperationRun:
    selected_action = _candidate("move_plugin", action_id="act_history_right")
    selection = _selection_for(selected_action)
    operation_result = _operation_result(operation="move_plugin")
    return ProductizedOperationRun(
        text="Completed Productized operation: move Plugin instance.",
        metrics=ProductizedOperationToolMetrics(
            modelCalls=1,
            actionSelectorCalls=1,
            actionSelectorRepairCalls=0,
            actionSelectorInvalidResponses=0,
            actionSelectorDurationMs=20,
            actionSelectorCandidateCount=3,
            actionSelectorContextCharacters=900,
            totalModelCalls=1,
        ),
        project_control=ProjectControlMetrics(),
        repeated_project_control_reads=0,
        domain_observations=DomainObservationMetrics(),
        app_ui_model_mutations=AppUIModelMutationMetrics(),
        snapshot_metrics=CreatorDomainSnapshotMetrics(builds=1),
        selection=selection,
        selected_action=selected_action,
        action_selector_metrics={
            "actionSelectorCalls": 1,
            "actionSelectorRepairCalls": 0,
            "actionSelectorInvalidResponses": 0,
            "actionSelectorDurationMs": 20,
            "actionSelectorCandidateCount": 3,
            "actionSelectorContextCharacters": 900,
        },
        intent_presentation=present_creator_action_selection(
            selection,
            selected_action,
            route="productized",
        ),
        operation_result=operation_result,
        validation_metrics={},
        completion="success",
    )


def test_server_serializes_new_action_result_without_legacy_resolver_fields(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("CREATOR_PYTHON_AGENT_MODE", "domain-write")
    settings = CreatorServerSettings(
        project_root=tmp_path,
        skills_root=tmp_path,
        auth_token="x" * 32,
    )

    async def fake_result(*_args, **_kwargs):
        return _server_productized_result()

    monkeypatch.setattr(
        "agent_ui_creator.server._domain_write_agent_result", fake_result
    )
    client = TestClient(
        create_app(settings), headers={"Authorization": f"Bearer {settings.auth_token}"}
    )

    response = client.post(
        "/creator",
        json={
            "threadId": "thread-1",
            "runId": "run-1",
            "messages": [{"role": "user", "content": "把会话管理移到最右边"}],
        },
    )

    assert response.status_code == 200
    assert '"actionSelector"' in response.text
    assert '"actionSelection"' in response.text
    assert '"selectedCreatorAction"' in response.text
    assert '"productizedOperation"' in response.text
    assert '"operationResolver"' not in response.text
    assert '"operationResolution"' not in response.text
    normalized_response = "".join(response.text.split())
    assert '"effect":{"type":"workspace_region","region":"right"}' in normalized_response
    for forbidden in (
        "workspace_region_move",
        "move_layout_node",
        "destinationTrack",
        "insertionIndex",
        "layoutRef",
        "bindings",
    ):
        assert forbidden not in response.text
