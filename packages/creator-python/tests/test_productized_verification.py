from __future__ import annotations

import asyncio
from types import SimpleNamespace

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.operations import (
    CompositionOperationVerificationService,
    CreatorOperationExecutionResult,
    CreatorOperationMetrics,
    CreatorOperationVerificationResult,
    resolve_runtime_plugin_slot_id,
)
from agent_ui_creator.operations.models import CreatorOperationPostconditionResult
from agent_ui_creator.operations.engine import ProductizedOperationEngine, _operation_text


class _Validation:
    async def ensure_baseline(self) -> None:
        pass

    async def validate(self, *, mode: str):
        assert mode == "delta"
        return SimpleNamespace(status="passed")


class _Runtime:
    def __init__(self, result: dict[str, object]) -> None:
        self.result = result

    async def inspect_host(self) -> dict[str, object]:
        return self.result


def test_workspace_reflow_rejects_a_narrow_surviving_center():
    expected_fill = [{
        "instanceId": "surface-main", "region": "center", "axis": "width", "trackIndex": 0,
    }]
    runtime = {
        "runtimeStatus": "passed",
        "compositionFresh": True,
        "compositionVerified": True,
        "currentHash": "c" * 64,
        "currentErrors": [],
        "runtimeInstances": [{
            "instanceId": "surface-main", "pluginId": "surface",
            "slotId": "layout-slot:root.children%5B0%5D.child",
            "rect": {"x": 0, "y": 0, "width": 280, "height": 600},
        }],
        "runtimeLayoutNodes": [{
            "nodeId": "layout-node:root", "type": "row",
            "rect": {"x": 0, "y": 0, "width": 1070, "height": 600},
            "trackWidths": [1070],
        }],
    }

    async def verify():
        return await CompositionOperationVerificationService(
            validation=_Validation(),
            runtime=_Runtime(runtime),
            verification_mode="static_and_runtime",
        ).verify(
            mutation_result={"appUIModel": {"afterHash": "c" * 64}},
            expected_runtime={"absentInstanceIds": ["history-main"]},
            expected_workspace_fill=expected_fill,
        )

    result = asyncio.run(verify())
    assert result.runtimeStatus == "failed"
    assert result.compositionVerified is True
    assert result.workspaceFillVerified is False

    runtime["runtimeInstances"][0]["rect"]["width"] = 1070
    passed = asyncio.run(verify())
    assert passed.runtimeStatus == "passed"
    assert passed.workspaceFillVerified is True


def test_runtime_plugin_slot_id_mirror_matches_encode_uri_component_rules():
    assert resolve_runtime_plugin_slot_id("composer-main", "actions") == "plugin:composer-main:actions"
    assert resolve_runtime_plugin_slot_id("composer main", "actions/x") == "plugin:composer%20main:actions%2Fx"
    assert resolve_runtime_plugin_slot_id("parent:é", "slot 空") == "plugin:parent%3A%C3%A9:slot%20%E7%A9%BA"


def test_failed_runtime_without_fresh_contradiction_is_unavailable():
    result = asyncio.run(
        CompositionOperationVerificationService(
            validation=_Validation(),
            runtime=_Runtime(
                {
                    "runtimeStatus": "failed",
                    "compositionFresh": True,
                    "compositionVerified": True,
                    "currentHash": "c" * 64,
                    "currentErrors": [],
                    "runtimeInstances": [],
                }
            ),
            verification_mode="static_and_runtime",
        ).verify(
            mutation_result={"appUIModel": {"afterHash": "c" * 64}},
            expected_runtime={"presentInstanceIds": [], "absentInstanceIds": []},
        )
    )

    assert result.runtimeStatus == "unavailable"


def test_static_only_productized_receipt_is_green_without_runtime_claim(tmp_path):
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("static-only-productized")
    engine = ProductizedOperationEngine.__new__(ProductizedOperationEngine)
    engine.activity = activity
    engine.verification_mode = "static_only"
    operation = CreatorOperationExecutionResult(
        operation="move_plugin",
        status="success",
        pluginId="history",
        instanceId="history-main",
        mutationChanged=True,
        mutationRevision=1,
        postcondition=CreatorOperationPostconditionResult(
            status="passed",
            kind="placement",
            instanceId="history-main",
            pluginId="history",
            appUIModelHash="c" * 64,
            evidence="The persisted placement matches the requested region.",
        ),
        verification=CreatorOperationVerificationResult(
            staticStatus="passed",
            runtimeStatus="not-run",
            runtimeFreshnessAttempts=0,
            runtimeFreshnessWaitMs=0,
        ),
        metrics=CreatorOperationMetrics(
            operationDurationMs=1,
            executionModelCalls=0,
            mutationAttempts=1,
            snapshotRefreshes=0,
            verificationRuntimeFreshnessAttempts=0,
        ),
    )

    engine._record_operation_verification(operation)

    assert activity.snapshot()["verification"] == {
        "status": "changed-and-statically-verified",
        "verificationMode": "static_only",
        "runtimeStatus": "not-run",
        "projectRevision": 0,
        "auditAttempts": 0,
        "checks": [
            {
                "id": "operation-postcondition",
                "status": "passed",
                "evidence": (
                    "The persisted placement matches the requested region. "
                    "已读回持久化 AppUIModel，哈希=" + "c" * 64 + "。 修改版本=1。"
                ),
            },
            {
                "id": "static-validation",
                "status": "passed",
                "evidence": "staticStatus=passed.",
            },
        ],
    }


def test_success_text_reports_static_failure_without_failing_operation(tmp_path):
    operation = CreatorOperationExecutionResult(
        operation="remove_plugin",
        status="success",
        pluginId="history",
        instanceId="history-main",
        mutationChanged=True,
        mutationRevision=1,
        postcondition=CreatorOperationPostconditionResult(
            status="passed",
            kind="instance_absent",
            instanceId="history-main",
            pluginId="history",
            appUIModelHash="c" * 64,
            evidence="The requested instance is absent from persisted state.",
        ),
        verification=CreatorOperationVerificationResult(
            staticStatus="failed",
            runtimeStatus="not-run",
            runtimeFreshnessAttempts=0,
            runtimeFreshnessWaitMs=0,
        ),
        metrics=CreatorOperationMetrics(
            operationDurationMs=1,
            executionModelCalls=0,
            mutationAttempts=1,
            snapshotRefreshes=0,
            verificationRuntimeFreshnessAttempts=0,
        ),
        errorCode=None,
    )

    assert operation.status == "success"
    assert operation.errorCode is None
    assert _operation_text(operation) == (
        "已完成：移除插件实例。 另外，修改后的项目静态验证未通过，请查看验证结果。"
    )

    engine = ProductizedOperationEngine.__new__(ProductizedOperationEngine)
    engine.verification_mode = "static_only"
    metadata = engine._operation_step_metadata(operation)
    assert metadata["postconditionStatus"] == "passed"
    assert metadata["postconditionKind"] == "instance_absent"
    assert metadata["postconditionEvidence"] == (
        "The requested instance is absent from persisted state."
    )

    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("static-failed-but-complete")
    engine.activity = activity
    engine._record_operation_verification(operation)
    receipt = activity.snapshot()["verification"]
    assert receipt["status"] == "failed"
    assert receipt["checks"][0]["id"] == "operation-postcondition"
    assert receipt["checks"][0]["status"] == "passed"
    assert receipt["checks"][1]["id"] == "static-validation"
    assert receipt["checks"][1]["status"] == "failed"


def test_success_text_reports_runtime_stale_as_separate_verification_result():
    operation = CreatorOperationExecutionResult(
        operation="remove_plugin",
        status="success",
        pluginId="history",
        instanceId="history-main",
        mutationChanged=True,
        mutationRevision=1,
        postcondition=CreatorOperationPostconditionResult(
            status="passed",
            kind="instance_absent",
            instanceId="history-main",
            pluginId="history",
            evidence="The requested instance is absent from persisted state.",
        ),
        verification=CreatorOperationVerificationResult(
            staticStatus="passed",
            runtimeStatus="stale",
            runtimeFreshnessAttempts=3,
            runtimeFreshnessWaitMs=1_000,
        ),
        metrics=CreatorOperationMetrics(
            operationDurationMs=1,
            executionModelCalls=0,
            mutationAttempts=1,
            snapshotRefreshes=0,
            verificationRuntimeFreshnessAttempts=3,
        ),
    )

    assert operation.status == "success"
    assert _operation_text(operation) == (
        "已完成：移除插件实例。 修改已持久化，但 Runtime 尚未观测到最新状态。"
    )


def test_committed_unverified_text_names_unconfirmed_request_result():
    operation = CreatorOperationExecutionResult(
        operation="remove_plugin",
        status="committed_unverified",
        pluginId="history",
        instanceId="history-main",
        mutationChanged=True,
        mutationRevision=1,
        postcondition=CreatorOperationPostconditionResult(
            status="unavailable",
            kind="instance_absent",
            instanceId="history-main",
            pluginId="history",
            evidence="Persisted AppUIModel readback was unavailable.",
        ),
        verification=CreatorOperationVerificationResult(
            staticStatus="passed",
            runtimeStatus="passed",
            runtimeFreshnessAttempts=1,
            runtimeFreshnessWaitMs=0,
        ),
        metrics=CreatorOperationMetrics(
            operationDurationMs=1,
            executionModelCalls=0,
            mutationAttempts=1,
            snapshotRefreshes=0,
            verificationRuntimeFreshnessAttempts=1,
        ),
    )

    assert _operation_text(operation) == (
        "修改已提交（移除插件实例），但无法确认请求结果是否成立："
        "Persisted AppUIModel readback was unavailable."
    )
