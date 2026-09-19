from __future__ import annotations

import asyncio
from types import SimpleNamespace

from agent_ui_creator.app_ui_model import (
    AppUIModelMutationError,
    AppUIModelMutationResult,
)
from agent_ui_creator.operations import (
    AddDefaultActionEffect,
    CompositionOperationVerificationService,
    CreatorActionCandidate,
    CreatorActionCatalogSnapshot,
    CreatorActionTarget,
    CreatorActionExecutionPlaybook,
    CreatorDomainSnapshot,
    PluginCapabilityIndex,
    RemoveActionEffect,
    WorkspaceRegionActionEffect,
)


class FakeValidation:
    def __init__(self, *, status: str = "passed") -> None:
        self.baseline_calls = 0
        self.validation_calls = 0
        self.status = status

    async def ensure_baseline(self) -> None:
        self.baseline_calls += 1

    async def validate(self, *, mode: str):
        assert mode == "delta"
        self.validation_calls += 1
        return SimpleNamespace(status=self.status)


class FakeRuntime:
    def __init__(self, results: list[dict[str, object]]) -> None:
        self.results = iter(results)
        self.inspect_calls = 0

    async def inspect_host(self) -> dict[str, object]:
        self.inspect_calls += 1
        return next(self.results)


class FakeMutation:
    def __init__(self, outcomes: list[object]) -> None:
        self.outcomes = iter(outcomes)
        self.calls: list[dict[str, object]] = []

    async def mutate(self, *, app_ui_model_hash: str, operations: list[dict[str, object]]):
        self.calls.append(
            {"appUIModelHash": app_ui_model_hash, "operations": operations}
        )
        outcome = next(self.outcomes)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome


class SequenceSnapshotProvider:
    def __init__(self, snapshots: list[CreatorDomainSnapshot]) -> None:
        self.snapshots = snapshots
        self.build_calls = 0

    async def build(self) -> CreatorDomainSnapshot:
        index = min(self.build_calls, len(self.snapshots) - 1)
        self.build_calls += 1
        return self.snapshots[index]


def action(
    kind: str,
    *,
    status: str = "ready",
    action_id: str = "act_history_right",
    instance_id: str | None = "history-main",
) -> CreatorActionCandidate:
    if kind == "add_existing_plugin":
        effect = AddDefaultActionEffect(type="add_default")
    elif kind == "remove_plugin":
        effect = RemoveActionEffect(type="remove")
    elif kind == "move_plugin":
        effect = WorkspaceRegionActionEffect(type="workspace_region", region="right")
    else:
        raise AssertionError(f"unsupported test action kind: {kind}")
    return CreatorActionCandidate(
        actionId=action_id,
        kind=kind,  # type: ignore[arg-type]
        status=status,  # type: ignore[arg-type]
        label="Move History to Workspace.Right",
        description="Move the History Plugin to the semantic Workspace.Right Region.",
        target=CreatorActionTarget(
            pluginId="history",
            pluginName="History",
            **({} if instance_id is None else {"instanceId": instance_id}),
        ),
        effect=effect,
    )


def snapshot(
    candidate: CreatorActionCandidate,
    *,
    app_ui_model_hash: str = "a" * 64,
) -> CreatorDomainSnapshot:
    return CreatorDomainSnapshot(
        raw={},
        app_ui_model_hash=app_ui_model_hash,
        capability_catalog_revision="b" * 64,
        observation_coverage=(),
        plugin_index=PluginCapabilityIndex(plugins=[]),
        action_catalog=CreatorActionCatalogSnapshot(
            revision="c" * 64,
            candidates=[candidate],
        ),
    )


def mutation(
    candidate: CreatorActionCandidate,
    *,
    changed: bool = True,
    action_id: str | None = None,
    semantic_action_id: str | None = None,
    action_kind: str | None = None,
    semantic_action_kind: str | None = None,
    action_status: str | None = None,
    semantic_action_status: str | None = None,
    expected_placement: dict[str, object] | None = None,
    expected_workspace_fill: list[dict[str, object]] | None = None,
) -> AppUIModelMutationResult:
    status = "ready" if changed else "already_satisfied"
    instance_id = candidate.target.instanceId
    operation = {
        "add_existing_plugin": "insert_plugin_default",
        "remove_plugin": "remove_plugin_default",
        "move_plugin": "move_plugin_to",
    }[candidate.kind]
    if candidate.kind == "add_existing_plugin":
        expected_runtime = {
            "presentInstanceIds": [instance_id or "history-main"]
        }
    elif candidate.kind == "remove_plugin":
        expected_runtime = {
            "absentInstanceIds": [] if instance_id is None else [instance_id]
        }
    else:
        expected_runtime = {"presentInstanceIds": [instance_id], "absentInstanceIds": []}
    semantic: dict[str, object] = {
        "operation": operation,
        "semanticLoweringSucceeded": True,
        "actionId": semantic_action_id or candidate.actionId,
        "actionKind": semantic_action_kind or candidate.kind,
        "actionStatus": semantic_action_status or status,
        "expectedRuntime": expected_runtime,
    }
    if candidate.kind == "add_existing_plugin" and changed:
        if expected_placement is None:
            semantic["expectedGeometry"] = {
                "instanceId": instance_id or "history-main",
                "anchorInstanceId": "conversation-main",
                "relation": "before",
                "axis": "width",
                "size": "280px",
            }
    if candidate.kind in {"add_existing_plugin", "move_plugin"} and expected_placement is not None:
        semantic["expectedPlacement"] = expected_placement
    if expected_workspace_fill is not None:
        semantic["expectedWorkspaceFill"] = expected_workspace_fill
    result = {
        "schemaVersion": 1,
        "transactionId": "transaction",
        "changed": changed,
        "changedPaths": ["app-ui/app-ui.json"] if changed else [],
        "appUIModel": {"beforeHash": "a" * 64, "afterHash": "c" * 64},
        "creatorAction": {
            "actionId": action_id or candidate.actionId,
            "actionKind": action_kind or candidate.kind,
            "status": action_status or status,
        },
        "semanticComposition": semantic,
    }
    return AppUIModelMutationResult(result, mutation_revision=1)


def verification(runtime_results: list[dict[str, object]]):
    return CompositionOperationVerificationService(
        validation=FakeValidation(),
        runtime=FakeRuntime(runtime_results),
    )


def successful_move_runtime(
    *,
    anchor_id: str = "conversation-main",
    anchor_x: int = 0,
) -> list[dict[str, object]]:
    return [
        {
            "currentHash": "c" * 64,
            "runtimeStatus": "passed",
            "compositionFresh": True,
            "compositionVerified": True,
            "currentErrors": [],
            "runtimeInstances": [
                {
                    "instanceId": "history-main",
                    "rect": {"x": 802, "y": 0, "width": 280, "height": 800},
                },
                {
                    "instanceId": anchor_id,
                    "rect": {"x": anchor_x, "y": 0, "width": 800, "height": 800},
                },
            ],
        }
    ]


def make_playbook(
    mutation_service: FakeMutation,
    provider: SequenceSnapshotProvider,
    runtime_results: list[dict[str, object]],
) -> CreatorActionExecutionPlaybook:
    return CreatorActionExecutionPlaybook(
        mutation_service=mutation_service,
        snapshot_provider=provider,  # type: ignore[arg-type]
        verification=verification(runtime_results),
    )


def test_ready_action_executes_one_host_action_and_verifies_host_expectations():
    candidate = action("move_plugin")
    source = snapshot(candidate)
    expected_placement = {
        "type": "relative",
        "instanceId": "history-main",
        "anchorInstanceId": "conversation-main",
        "relation": "after",
    }
    mutation_service = FakeMutation(
        [mutation(candidate, expected_placement=expected_placement)]
    )
    playbook = make_playbook(
        mutation_service,
        SequenceSnapshotProvider([source]),
        successful_move_runtime(),
    )

    result = asyncio.run(playbook.execute(source, candidate))

    assert result.status == "success"
    assert result.instanceId == "history-main"
    assert result.metrics.executionModelCalls == 0
    assert result.metrics.mutationAttempts == 1
    assert mutation_service.calls == [
        {
            "appUIModelHash": "a" * 64,
            "operations": [
                {"type": "execute_creator_action", "actionId": "act_history_right"}
            ],
        }
    ]


def test_already_satisfied_action_still_reaches_host_and_skips_post_mutation_verification():
    candidate = action("move_plugin", status="already_satisfied")
    source = snapshot(candidate)
    mutation_service = FakeMutation([mutation(candidate, changed=False)])
    playbook = make_playbook(
        mutation_service,
        SequenceSnapshotProvider([source]),
        [],
    )

    result = asyncio.run(playbook.execute(source, candidate))

    assert result.status == "already_satisfied"
    assert result.mutationChanged is False
    assert result.verification is None
    assert mutation_service.calls[0]["operations"] == [
        {"type": "execute_creator_action", "actionId": candidate.actionId}
    ]


def test_workspace_region_move_does_not_require_a_synthetic_expected_anchor():
    candidate = action("move_plugin")
    source = snapshot(candidate)
    mutation_service = FakeMutation([mutation(candidate)])
    playbook = make_playbook(
        mutation_service,
        SequenceSnapshotProvider([source]),
        successful_move_runtime(),
    )

    result = asyncio.run(playbook.execute(source, candidate))

    assert result.status == "success"
    assert result.instanceId == "history-main"


def test_remove_action_fails_when_surviving_workspace_branch_does_not_fill_track():
    candidate = action("remove_plugin")
    source = snapshot(candidate)
    mutation_service = FakeMutation([mutation(candidate, expected_workspace_fill=[{
        "instanceId": "conversation-main", "region": "center", "axis": "width", "trackIndex": 0,
    }])])
    playbook = make_playbook(
        mutation_service,
        SequenceSnapshotProvider([source]),
        [{
            "currentHash": "c" * 64,
            "runtimeStatus": "passed",
            "compositionFresh": True,
            "compositionVerified": True,
            "currentErrors": [],
            "runtimeInstances": [{
                "instanceId": "conversation-main",
                "rect": {"x": 0, "y": 0, "width": 280, "height": 800},
            }],
            "runtimeLayoutNodes": [{
                "nodeId": "layout-node:root", "type": "row",
                "rect": {"x": 0, "y": 0, "width": 1070, "height": 800},
                "trackWidths": [1070],
            }],
        }],
    )
    result = asyncio.run(playbook.execute(source, candidate))
    assert result.status == "failed"
    assert result.verification is not None
    assert result.verification.runtimeStatus == "failed"
    assert result.verification.compositionVerified is True
    assert result.verification.workspaceFillVerified is False


def test_hash_conflict_refreshes_once_and_retries_the_same_action_id():
    candidate = action("move_plugin")
    refreshed_candidate = action("move_plugin")
    source = snapshot(candidate)
    refreshed = snapshot(refreshed_candidate, app_ui_model_hash="b" * 64)
    expected_placement = {
        "type": "relative",
        "instanceId": "history-main",
        "anchorInstanceId": "inspector-main",
        "relation": "after",
    }
    mutation_service = FakeMutation(
        [
            AppUIModelMutationError("APP_UI_MODEL_HASH_CONFLICT", "stale hash"),
            mutation(refreshed_candidate, expected_placement=expected_placement),
        ]
    )
    provider = SequenceSnapshotProvider([refreshed])
    playbook = make_playbook(
        mutation_service,
        provider,
        successful_move_runtime(anchor_id="inspector-main"),
    )

    result = asyncio.run(playbook.execute(source, candidate))

    assert result.status == "success"
    assert result.metrics.mutationAttempts == 2
    assert result.metrics.snapshotRefreshes == 1
    assert provider.build_calls == 1
    assert [
        call["operations"] for call in mutation_service.calls
    ] == [
        [{"type": "execute_creator_action", "actionId": candidate.actionId}],
        [{"type": "execute_creator_action", "actionId": candidate.actionId}],
    ]
    assert mutation_service.calls[1]["appUIModelHash"] == "b" * 64


def test_hash_conflict_retry_uses_refreshed_already_satisfied_status():
    candidate = action("move_plugin")
    refreshed_candidate = action("move_plugin", status="already_satisfied")
    source = snapshot(candidate)
    refreshed = snapshot(refreshed_candidate, app_ui_model_hash="b" * 64)
    mutation_service = FakeMutation(
        [
            AppUIModelMutationError("APP_UI_MODEL_HASH_CONFLICT", "stale hash"),
            mutation(refreshed_candidate, changed=False),
        ]
    )
    provider = SequenceSnapshotProvider([refreshed])
    playbook = make_playbook(mutation_service, provider, [])

    result = asyncio.run(playbook.execute(source, candidate))

    assert result.status == "already_satisfied"
    assert result.metrics.mutationAttempts == 2
    assert result.metrics.snapshotRefreshes == 1
    assert len(mutation_service.calls) == 2


def test_action_not_available_refresh_with_missing_action_returns_stale_without_retry():
    candidate = action("move_plugin")
    source = snapshot(candidate)
    refreshed = snapshot(action("move_plugin", action_id="act_replacement"))
    mutation_service = FakeMutation(
        [AppUIModelMutationError("CREATOR_ACTION_NOT_AVAILABLE", "catalog changed")]
    )
    provider = SequenceSnapshotProvider([refreshed])
    playbook = make_playbook(mutation_service, provider, [])

    result = asyncio.run(playbook.execute(source, candidate))

    assert result.status == "failed"
    assert result.errorCode == "PRODUCT_OPERATION_STALE"
    assert result.metrics.mutationAttempts == 1
    assert result.metrics.snapshotRefreshes == 1
    assert len(mutation_service.calls) == 1


def test_host_creator_action_identity_mismatch_is_invalid_before_verification():
    candidate = action("move_plugin")
    source = snapshot(candidate)
    mutation_service = FakeMutation(
        [mutation(candidate, action_id="act_other")]
    )
    playbook = make_playbook(
        mutation_service,
        SequenceSnapshotProvider([source]),
        [],
    )

    result = asyncio.run(playbook.execute(source, candidate))

    assert result.status == "failed"
    assert result.errorCode == "PRODUCT_OPERATION_RESULT_INVALID"
    assert result.verification is None


def test_host_semantic_action_identity_mismatch_is_invalid():
    candidate = action("move_plugin")
    source = snapshot(candidate)
    mutation_service = FakeMutation(
        [mutation(candidate, semantic_action_id="act_other")]
    )
    playbook = make_playbook(
        mutation_service,
        SequenceSnapshotProvider([source]),
        [],
    )

    result = asyncio.run(playbook.execute(source, candidate))

    assert result.status == "failed"
    assert result.errorCode == "PRODUCT_OPERATION_RESULT_INVALID"


def test_host_action_kind_mismatch_is_invalid():
    candidate = action("move_plugin")
    source = snapshot(candidate)
    mutation_service = FakeMutation(
        [mutation(candidate, action_kind="remove_plugin")]
    )
    playbook = make_playbook(
        mutation_service,
        SequenceSnapshotProvider([source]),
        [],
    )

    result = asyncio.run(playbook.execute(source, candidate))

    assert result.errorCode == "PRODUCT_OPERATION_RESULT_INVALID"


def test_host_semantic_action_kind_mismatch_is_invalid():
    candidate = action("move_plugin")
    source = snapshot(candidate)
    mutation_service = FakeMutation(
        [mutation(candidate, semantic_action_kind="remove_plugin")]
    )
    playbook = make_playbook(
        mutation_service,
        SequenceSnapshotProvider([source]),
        [],
    )

    result = asyncio.run(playbook.execute(source, candidate))

    assert result.errorCode == "PRODUCT_OPERATION_RESULT_INVALID"


def test_changed_status_mismatch_is_invalid():
    candidate = action("move_plugin")
    source = snapshot(candidate)
    mutation_service = FakeMutation(
        [mutation(candidate, action_status="already_satisfied")]
    )
    playbook = make_playbook(
        mutation_service,
        SequenceSnapshotProvider([source]),
        [],
    )

    result = asyncio.run(playbook.execute(source, candidate))

    assert result.status == "failed"
    assert result.errorCode == "PRODUCT_OPERATION_RESULT_INVALID"


def test_add_result_instance_id_comes_from_host_expected_runtime():
    candidate = action("add_existing_plugin", instance_id=None)
    source = snapshot(candidate)
    mutation_service = FakeMutation([mutation(candidate)])
    playbook = make_playbook(
        mutation_service,
        SequenceSnapshotProvider([source]),
        [
            {
                "currentHash": "c" * 64,
                "runtimeStatus": "passed",
                "compositionFresh": True,
                "compositionVerified": True,
                "currentErrors": [],
                "runtimeInstances": [
                    {
                        "instanceId": "history-main",
                        "rect": {"x": 0, "y": 0, "width": 280, "height": 800},
                    },
                    {
                        "instanceId": "conversation-main",
                        "rect": {"x": 280, "y": 0, "width": 800, "height": 800},
                    },
                ],
            }
        ],
    )

    result = asyncio.run(playbook.execute(source, candidate))

    assert result.status == "success"
    assert result.instanceId == "history-main"


def test_add_plugin_slot_requires_verified_runtime_mount():
    candidate = action("add_existing_plugin", instance_id=None)
    source = snapshot(candidate)
    expected_placement = {
        "type": "plugin_slot",
        "instanceId": "history-main",
        "parentInstanceId": "conversation-main",
        "slot": "slotX",
    }
    runtime = {
        "currentHash": "c" * 64,
        "runtimeStatus": "passed",
        "compositionFresh": True,
        "compositionVerified": True,
        "currentErrors": [],
        "runtimeInstances": [{
            "instanceId": "history-main",
            "slotId": "plugin:conversation-main:wrong-slot",
        }],
    }
    playbook = make_playbook(
        FakeMutation([mutation(candidate, expected_placement=expected_placement)]),
        SequenceSnapshotProvider([source]),
        [runtime],
    )
    failed = asyncio.run(playbook.execute(source, candidate))
    assert failed.status == "failed"
    assert failed.verification.placementVerified is False

    runtime["runtimeInstances"][0]["slotId"] = "plugin:conversation-main:slotX"
    playbook = make_playbook(
        FakeMutation([mutation(candidate, expected_placement=expected_placement)]),
        SequenceSnapshotProvider([source]),
        [runtime],
    )
    passed = asyncio.run(playbook.execute(source, candidate))
    assert passed.status == "success"
    assert passed.verification.placementVerified is True


def test_remove_action_succeeds_when_host_and_runtime_agree():
    candidate = action("remove_plugin")
    source = snapshot(candidate)
    mutation_service = FakeMutation([mutation(candidate)])
    playbook = make_playbook(
        mutation_service,
        SequenceSnapshotProvider([source]),
        [{
            "currentHash": "c" * 64,
            "runtimeStatus": "passed",
            "compositionFresh": True,
            "compositionVerified": True,
            "currentErrors": [],
            "runtimeInstances": [],
        }],
    )

    result = asyncio.run(playbook.execute(source, candidate))

    assert result.status == "success"
    assert result.verification is not None
    assert result.verification.absentInstancesVerified == ["history-main"]


def test_action_static_validation_failure_skips_runtime():
    candidate = action("add_existing_plugin", instance_id=None)
    source = snapshot(candidate)
    mutation_service = FakeMutation([mutation(candidate)])
    validation = FakeValidation(status="failed")
    runtime = FakeRuntime([])
    playbook = CreatorActionExecutionPlaybook(
        mutation_service=mutation_service,
        snapshot_provider=SequenceSnapshotProvider([source]),  # type: ignore[arg-type]
        verification=CompositionOperationVerificationService(
            validation=validation, runtime=runtime
        ),
    )

    result = asyncio.run(playbook.execute(source, candidate))

    assert result.status == "failed"
    assert result.verification is not None
    assert result.verification.staticStatus == "failed"
    assert result.verification.runtimeStatus == "not-run"
    assert runtime.inspect_calls == 0


def test_action_reports_committed_unverified_for_stale_runtime():
    candidate = action("remove_plugin")
    source = snapshot(candidate)
    mutation_service = FakeMutation([mutation(candidate)])
    playbook = make_playbook(
        mutation_service,
        SequenceSnapshotProvider([source]),
        [{"runtimeStatus": "stale", "compositionFresh": False}] * 3,
    )

    result = asyncio.run(playbook.execute(source, candidate))

    assert result.status == "committed_unverified"
    assert result.mutationChanged is True
    assert result.metrics.verificationRuntimeFreshnessAttempts == 3


def test_action_normalizes_host_mutation_failure_without_verification():
    candidate = action("move_plugin")
    source = snapshot(candidate)
    mutation_service = FakeMutation([
        AppUIModelMutationError("HOST_MOVE_REJECTED", "move rejected")
    ])
    playbook = make_playbook(mutation_service, SequenceSnapshotProvider([source]), [])

    result = asyncio.run(playbook.execute(source, candidate))

    assert result.status == "failed"
    assert result.errorCode == "HOST_MOVE_REJECTED"
    assert result.verification is None
    assert result.metrics.mutationAttempts == 1
