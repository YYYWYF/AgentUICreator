from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from agent_ui_creator.app_ui_model import AppUIModelMutationMetrics
from agent_ui_creator.domain_state import DomainObservationContext, DomainObservationMetrics
from agent_ui_creator.operations import (
    CreatorDomainSnapshot,
    CreatorOperationExecutionResult,
    CreatorOperationMetrics,
    CreatorOperationResolution,
    CreatorOperationResolverMetrics,
    PluginCapabilityIndex,
)
from agent_ui_creator.operations.engine import (
    ProductizedOperationEngine,
    ProductizedOperationRun,
    ProductizedOperationToolMetrics,
)
from agent_ui_creator.operations.snapshot import CreatorDomainSnapshotMetrics
from agent_ui_creator.observability import CreatorRunTelemetry
from agent_ui_creator.project_control import ProjectControlMetrics
from agent_ui_creator.config import CreatorServerSettings
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
)


class _SnapshotProvider:
    def __init__(self) -> None:
        self.metrics = CreatorDomainSnapshotMetrics()

    async def build(self) -> CreatorDomainSnapshot:
        return CreatorDomainSnapshot(
            raw={},
            app_ui_model_hash="a" * 64,
            capability_catalog_revision="b" * 64,
            observation_coverage=_OBSERVATION_COVERAGE,
            plugin_index=PluginCapabilityIndex(),
        )


class _Resolver:
    def __init__(self, resolution: CreatorOperationResolution) -> None:
        self.resolution = resolution
        self.metrics = CreatorOperationResolverMetrics(modelCalls=1)

    async def resolve(self, _message, _plugin_index):
        return self.resolution


class _Registry:
    def __init__(self, playbook) -> None:
        self.playbook = playbook
        self.calls: list[str] = []

    def get(self, operation: str):
        self.calls.append(operation)
        return self.playbook


class _Playbook:
    def __init__(self, result) -> None:
        self.result = result
        self.calls = 0

    async def execute(self, _snapshot, _resolution):
        self.calls += 1
        return self.result


def _operation_result(
    status: str = "success",
    operation: str = "add_existing_plugin",
) -> CreatorOperationExecutionResult:
    mutation_changed = status != "already_satisfied"
    return CreatorOperationExecutionResult(
        operation=operation,
        status=status,
        pluginId="conversation-thread-list",
        instanceId="conversation-thread-list-main",
        mutationChanged=mutation_changed,
        mutationRevision=1 if mutation_changed else None,
        metrics=CreatorOperationMetrics(
            operationDurationMs=1,
            executionModelCalls=0,
            mutationAttempts=1 if mutation_changed else 0,
            snapshotRefreshes=0,
            verificationRuntimeFreshnessAttempts=0,
        ),
    )


def _engine(
    resolution: CreatorOperationResolution,
    *,
    playbook=None,
    event_sink=None,
) -> tuple[ProductizedOperationEngine, _Registry, CreatorRunTelemetry]:
    telemetry = CreatorRunTelemetry()
    engine = object.__new__(ProductizedOperationEngine)
    engine.activity = SimpleNamespace(
        revision=0,
        logger=None,
        record_semantic_noop=lambda **_kwargs: None,
    )
    engine.snapshot_provider = _SnapshotProvider()
    engine.observations = DomainObservationContext()
    engine.resolver = _Resolver(resolution)
    registry = _Registry(playbook)
    engine.registry = registry
    engine.project_control = SimpleNamespace(metrics=ProjectControlMetrics())
    engine.mutation_service = SimpleNamespace(metrics=AppUIModelMutationMetrics())
    engine.validation = SimpleNamespace(metrics=lambda: {})
    engine.telemetry = telemetry
    if event_sink is not None:
        engine.event_sink = event_sink
    return engine, registry, telemetry


@pytest.mark.parametrize("kind", ["add_existing_plugin", "remove_plugin", "move_plugin"])
def test_productized_routing_uses_registered_playbook_for_productized_operations(kind):
    resolution_kwargs = {
        "kind": kind,
        "targetPluginIds": ["conversation-thread-list"],
    }
    if kind == "move_plugin":
        resolution_kwargs.update(
            {
                "targetInstanceIds": ["conversation-thread-list-main"],
                "placement": {
                    "type": "relative",
                    "anchorPluginId": "conversation-surface",
                    "anchorInstanceId": "conversation-surface-main",
                    "relation": "after",
                },
            }
        )
    resolution = CreatorOperationResolution(**resolution_kwargs)
    operation_result = _operation_result(operation=kind)
    playbook = _Playbook(operation_result)
    engine, registry, telemetry = _engine(resolution, playbook=playbook)

    result = asyncio.run(engine.run([{"role": "user", "content": "change"}]))

    assert isinstance(result, ProductizedOperationRun)
    assert result.operation_result is operation_result
    assert result.metrics.toolCalls == 0
    assert result.metrics.deepAgentCalls == 0
    assert registry.calls == [kind]
    assert playbook.calls == 1
    assert telemetry.operation_route["productized"] is True
    assert telemetry.operation_route["fallback"] is False


def test_engine_publishes_resolve_before_productized_execution():
    resolution = CreatorOperationResolution(
        kind="remove_plugin",
        targetPluginIds=["conversation-thread-list"],
    )
    event_bus = CreatorEventBus()
    engine, _registry, _telemetry = _engine(
        resolution,
        playbook=_Playbook(_operation_result(operation="remove_plugin")),
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


@pytest.mark.parametrize("kind", ["general_change", "modify_plugin_logic"])
def test_productized_routing_returns_none_for_general_agent_fallback(kind):
    resolution = CreatorOperationResolution(
        kind=kind,
        targetPluginIds=["conversation-thread-list"],
    )
    engine, registry, telemetry = _engine(resolution)

    result = asyncio.run(engine.run([{"role": "user", "content": "change"}]))

    assert result is None
    assert registry.calls == [kind]
    assert telemetry.operation_route["productized"] is False
    assert telemetry.operation_route["fallback"] is True


def test_needs_clarification_finishes_without_playbook_or_general_fallback():
    question = "你要删除历史会话，还是当前会话面板？"
    resolution = CreatorOperationResolution(
        kind="needs_clarification",
        clarificationQuestion=question,
    )
    engine, registry, telemetry = _engine(resolution)

    result = asyncio.run(engine.run([{"role": "user", "content": "删除那个会话"}]))

    assert isinstance(result, ProductizedOperationRun)
    assert result.text == question
    assert result.operation_result is None
    assert result.completion == "success"
    assert result.metrics.to_dict() == {
        "modelCalls": 1,
        "operationResolverCalls": 1,
        "operationResolverRepairCalls": 0,
        "operationResolverInvalidResponses": 0,
        "toolCalls": 0,
        "validToolCalls": 0,
        "invalidToolCalls": 0,
        "deepAgentCalls": 0,
    }
    assert registry.calls == []
    assert telemetry.operation_route["productized"] is False
    assert telemetry.operation_route["fallback"] is False


def test_committed_unverified_preserves_top_level_completion_status():
    resolution = CreatorOperationResolution(
        kind="add_existing_plugin",
        targetPluginIds=["conversation-thread-list"],
    )
    engine, _registry, _telemetry = _engine(
        resolution,
        playbook=_Playbook(_operation_result("committed_unverified")),
    )

    result = asyncio.run(engine.run([{"role": "user", "content": "change"}]))

    assert result is not None
    assert result.completion == "committed_unverified"
    assert result.operation_result.status == "committed_unverified"


def _server_productized_result() -> ProductizedOperationRun:
    resolution = CreatorOperationResolution(
        kind="add_existing_plugin",
        targetPluginIds=["conversation-thread-list"],
    )
    operation_result = CreatorOperationExecutionResult(
        operation="add_existing_plugin",
        status="success",
        pluginId="conversation-thread-list",
        instanceId="conversation-thread-list-main",
        mutationChanged=True,
        mutationRevision=1,
        metrics=CreatorOperationMetrics(
            operationDurationMs=1,
            executionModelCalls=0,
            mutationAttempts=1,
            snapshotRefreshes=0,
            verificationRuntimeFreshnessAttempts=0,
        ),
    )
    return ProductizedOperationRun(
        text="Completed Productized operation: add existing Plugin.",
        metrics=ProductizedOperationToolMetrics(
            modelCalls=1,
            operationResolverCalls=1,
            operationResolverRepairCalls=0,
            operationResolverInvalidResponses=0,
        ),
        project_control=ProjectControlMetrics(),
        repeated_project_control_reads=0,
        domain_observations=DomainObservationMetrics(),
        app_ui_model_mutations=AppUIModelMutationMetrics(),
        operation_resolver_metrics={
            "operationResolverCalls": 1,
            "operationResolverRepairCalls": 0,
            "operationResolverInvalidResponses": 0,
        },
        snapshot_metrics=CreatorDomainSnapshotMetrics(builds=1),
        resolution=resolution,
        operation_result=operation_result,
        validation_metrics={},
        completion="success",
    )


def test_server_serializes_productized_run_metrics_without_general_agent(
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
            "messages": [{"role": "user", "content": "加回历史会话"}],
        },
    )

    assert '"phase":"productized-operation"' in response.text
    assert '"operationResolverCalls":1' in response.text
    assert '"toolCalls":0' in response.text
    assert '"deepAgentCalls":0' in response.text
    assert '"productizedOperation"' in response.text
