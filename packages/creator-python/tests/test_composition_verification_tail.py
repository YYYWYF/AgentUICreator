from __future__ import annotations

from types import SimpleNamespace

import pytest

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.app_ui_model import AppUIModelMutationResult
from agent_ui_creator.domain_agent.composition_verification_tail import (
    CompositionVerificationTail,
)
from agent_ui_creator.domain_state import CompositionFastPathMetrics


class FakeValidation:
    async def validate(self, mode: str):
        assert mode == "delta"
        return SimpleNamespace(status="passed", revision=1)


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
