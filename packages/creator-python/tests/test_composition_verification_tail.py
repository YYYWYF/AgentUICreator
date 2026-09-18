from __future__ import annotations

from types import SimpleNamespace

import pytest

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.app_ui_model import (
    AppUIModelMutationMetrics,
    AppUIModelMutationResult,
)
from agent_ui_creator.domain_agent import CreatorDomainWriteAgent
from agent_ui_creator.domain_agent.completion_gate import (
    CreatorDevelopmentCompletionGate,
)
from agent_ui_creator.domain_agent.composition_verification_tail import (
    CompositionVerificationTail,
)
from agent_ui_creator.domain_state import (
    CompositionFastPathMetrics,
    DomainObservationContext,
)
from agent_ui_creator.model_protocol.trace import ToolProtocolMetrics
from agent_ui_creator.project_control import ProjectControlMetrics
from agent_ui_creator.repair import CreatorRepairState
from agent_ui_creator.run_control import CreatorRunControlState
from langchain_core.messages import AIMessage


class FakeValidation:
    def __init__(self):
        self.result = None

    async def validate(self, mode: str):
        assert mode == "delta"
        self.result = SimpleNamespace(
            status="passed",
            revision=1,
            checks=[
                SimpleNamespace(
                    command="pnpm verify:ui",
                    status="passed",
                    revision=1,
                    source="executed",
                    exit_code=0,
                ),
                SimpleNamespace(
                    command="pnpm typecheck",
                    status="passed",
                    revision=1,
                    source="executed",
                    exit_code=0,
                ),
            ],
        )
        return self.result

    def current_result(self):
        return self.result


class FakeRuntime:
    def __init__(self, results, layout=None):
        self.results = iter(results)
        self.layout = layout
        self.latest_result = None

    async def inspect(self):
        return next(self.results)

    async def inspect_layout(self, *, instance_ids):
        assert instance_ids == ["thread-list-main", "surface-main"]
        return self.layout

    def publish_host_verification(self, verification_tail, *, runtime_result=None):
        self.latest_result = {
            **(runtime_result or {}),
            "verificationTail": verification_tail,
        }
        return self.latest_result

    def current_result(self):
        return self.latest_result


class CountingGraphStream:
    def __init__(self, state):
        self.state = state
        self.aborted = False

    async def _tool_calls(self):
        if False:
            yield None

    @property
    def tool_calls(self):
        return self._tool_calls()

    async def output(self):
        return self.state

    async def abort(self):
        self.aborted = True


class CountingGraph:
    def __init__(self, state):
        self.state = state
        self.invocations = 0

    async def astream_events(self, *_args, **_kwargs):
        self.invocations += 1
        return CountingGraphStream(self.state)


def mutation_result(*, expected_geometry=None):
    target = {
        "changed": True,
        "semanticComposition": {"operation": "insert_plugin_default"},
    }
    if expected_geometry is not None:
        target["semanticComposition"]["expectedGeometry"] = expected_geometry
    return SimpleNamespace(
        last_result=AppUIModelMutationResult(target, mutation_revision=1)
    )


def activity_for_revision(tmp_path):
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("verification-tail")
    activity.capture_before_content("app-ui/app-ui.json", "{}\n")
    activity.touch("app-ui/app-ui.json")
    return activity


def mutated_activity_for_revision(tmp_path):
    app_ui_path = tmp_path / "app-ui" / "app-ui.json"
    app_ui_path.parent.mkdir()
    app_ui_path.write_text("{}\n", encoding="utf-8")
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("verification-tail-agent-lifecycle")
    activity.capture_before("app-ui/app-ui.json")
    app_ui_path.write_text('{"changed": true}\n', encoding="utf-8")
    activity.touch("app-ui/app-ui.json")
    return activity


@pytest.mark.asyncio
async def test_tail_verifies_expected_semantic_geometry(tmp_path):
    activity = activity_for_revision(tmp_path)
    runtime = FakeRuntime(
        [
            {
                "runtimeStatus": "passed",
                "runtimeObserved": True,
                "compositionFresh": True,
                "currentErrors": [],
            }
        ],
        layout={
            "runtimeStatus": "available",
            "compositionFresh": True,
            "instances": [
                {
                    "instanceId": "thread-list-main",
                    "rect": {"x": 0, "y": 0, "width": 280, "height": 800},
                },
                {
                    "instanceId": "surface-main",
                    "rect": {"x": 280, "y": 0, "width": 1120, "height": 800},
                },
            ],
        },
    )
    tail = CompositionVerificationTail(
        activity=activity,
        validation=FakeValidation(),
        runtime=runtime,
        metrics=CompositionFastPathMetrics(),
    )

    result = await tail.run_if_needed(
        mutation_result(
            expected_geometry={
                "instanceId": "thread-list-main",
                "anchorInstanceId": "surface-main",
                "relation": "before",
                "axis": "width",
                "size": "280px",
            }
        )
    )

    assert result is not None
    assert result["geometryVerified"] is True
    assert result["runtimeStatus"] == "passed"
    assert runtime.latest_result["verificationTail"] == result


@pytest.mark.asyncio
async def test_tail_bounds_stale_runtime_wait_without_claiming_pass(
    tmp_path, monkeypatch
):
    monkeypatch.setattr(
        "agent_ui_creator.domain_agent.composition_verification_tail.RUNTIME_FRESHNESS_DELAY_SECONDS",
        0,
    )
    activity = activity_for_revision(tmp_path)
    runtime = FakeRuntime(
        [
            {"runtimeStatus": "stale", "compositionFresh": False},
            {"runtimeStatus": "stale", "compositionFresh": False},
            {"runtimeStatus": "stale", "compositionFresh": False},
        ]
    )
    metrics = CompositionFastPathMetrics()
    tail = CompositionVerificationTail(
        activity=activity,
        validation=FakeValidation(),
        runtime=runtime,
        metrics=metrics,
    )

    result = await tail.run_if_needed(
        mutation_result(
            expected_geometry={
                "instanceId": "thread-list-main",
                "anchorInstanceId": "surface-main",
                "relation": "before",
                "axis": "width",
                "size": "280px",
            }
        )
    )

    assert result is not None
    assert result["runtimeFreshnessAttempts"] == 3
    assert result["runtimeStatus"] == "stale"
    assert result["freshnessExhausted"] is True
    assert metrics.to_dict()["verificationTailRan"] is True
    assert metrics.to_dict()["geometryVerified"] is None


@pytest.mark.asyncio
async def test_tail_retries_stale_once_before_fresh_runtime(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "agent_ui_creator.domain_agent.composition_verification_tail.RUNTIME_FRESHNESS_DELAY_SECONDS",
        0,
    )
    activity = activity_for_revision(tmp_path)
    runtime = FakeRuntime(
        [
            {"runtimeStatus": "stale", "compositionFresh": False},
            {
                "runtimeStatus": "passed",
                "runtimeObserved": True,
                "compositionFresh": True,
                "currentErrors": [],
            },
        ]
    )
    tail = CompositionVerificationTail(
        activity=activity,
        validation=FakeValidation(),
        runtime=runtime,
        metrics=CompositionFastPathMetrics(),
    )

    result = await tail.run_if_needed(mutation_result())

    assert result is not None
    assert result["runtimeFreshnessAttempts"] == 2
    assert result["runtimeStatus"] == "passed"
    assert result["freshnessExhausted"] is False


@pytest.mark.asyncio
async def test_tail_rejects_fresh_geometry_mismatch(tmp_path):
    activity = activity_for_revision(tmp_path)
    runtime = FakeRuntime(
        [{
            "runtimeStatus": "passed",
            "runtimeObserved": True,
            "compositionFresh": True,
            "currentErrors": [],
        }],
        layout={
            "runtimeStatus": "available",
            "compositionFresh": True,
            "instances": [
                {
                    "instanceId": "thread-list-main",
                    "rect": {"x": 0, "y": 0, "width": 900, "height": 800},
                },
                {
                    "instanceId": "surface-main",
                    "rect": {"x": 900, "y": 0, "width": 500, "height": 800},
                },
            ],
        },
    )
    tail = CompositionVerificationTail(
        activity=activity,
        validation=FakeValidation(),
        runtime=runtime,
        metrics=CompositionFastPathMetrics(),
    )

    result = await tail.run_if_needed(
        mutation_result(
            expected_geometry={
                "instanceId": "thread-list-main",
                "anchorInstanceId": "surface-main",
                "relation": "before",
                "axis": "width",
                "size": "280px",
            }
        )
    )

    assert result is not None
    assert result["runtimeStatus"] == "failed"
    assert result["geometryVerified"] is False


@pytest.mark.asyncio
async def test_agent_lifecycle_accepts_stale_then_fresh_without_second_graph_invoke(
    tmp_path,
):
    activity = mutated_activity_for_revision(tmp_path)
    validation = FakeValidation()
    runtime_diagnostics = FakeRuntime(
        [
            {"runtimeStatus": "stale", "compositionFresh": False},
            {
                "runtimeStatus": "passed",
                "runtimeObserved": True,
                "compositionFresh": True,
                "currentErrors": [],
            },
        ],
        layout={
            "runtimeStatus": "available",
            "compositionFresh": True,
            "instances": [
                {
                    "instanceId": "thread-list-main",
                    "rect": {"x": 0, "y": 0, "width": 280, "height": 800},
                },
                {
                    "instanceId": "surface-main",
                    "rect": {"x": 280, "y": 0, "width": 1120, "height": 800},
                },
            ],
        },
    )
    metrics = CompositionFastPathMetrics()
    tail = CompositionVerificationTail(
        activity=activity,
        validation=validation,
        runtime=runtime_diagnostics,
        metrics=metrics,
    )
    mutation_service = SimpleNamespace(
        last_result=AppUIModelMutationResult(
            {
                "changed": True,
                "semanticComposition": {
                    "operation": "insert_plugin_default",
                    "expectedGeometry": {
                        "instanceId": "thread-list-main",
                        "anchorInstanceId": "surface-main",
                        "relation": "before",
                        "axis": "width",
                        "size": "280px",
                    },
                },
            },
            mutation_revision=1,
        ),
        metrics=AppUIModelMutationMetrics(),
    )
    graph = CountingGraph({"messages": [AIMessage(content="Composition updated.")]})
    run_control = CreatorRunControlState()
    agent_runtime = SimpleNamespace(
        backend=SimpleNamespace(activity=activity),
        activities=[],
        raise_terminal_error=lambda: None,
    )
    project_control = SimpleNamespace(metrics=ProjectControlMetrics())
    repeated_read_guard = SimpleNamespace(repeated_reads=0)
    observations = DomainObservationContext()
    protocol = SimpleNamespace(metrics=ToolProtocolMetrics())
    completion_gate = CreatorDevelopmentCompletionGate(
        activity=activity,
        validation=validation,
        runtime=runtime_diagnostics,
        repair_state=CreatorRepairState(),
        run_control=run_control,
    )
    agent = CreatorDomainWriteAgent(
        graph=graph,
        protocol=protocol,
        runtime=agent_runtime,
        repeated_read_guard=repeated_read_guard,
        project_control=project_control,
        observations=observations,
        mutation_service=mutation_service,
        completion_gate=completion_gate,
        completion_verification_tail=tail,
        automatic_completion_repair=False,
        run_control=run_control,
    )

    result = await agent.run("Add the history panel.")

    assert graph.invocations == 1
    assert result.completion == "success"
    assert result.composition_fast_path_metrics.verificationTailRan is True
    assert result.composition_fast_path_metrics.runtimeFreshnessAttempts == 2
    assert result.composition_fast_path_metrics.geometryVerified is True
    assert runtime_diagnostics.latest_result["runtimeStatus"] == "passed"
    assert runtime_diagnostics.latest_result["verificationTail"][
        "freshnessExhausted"
    ] is False
