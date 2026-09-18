from __future__ import annotations

import asyncio
from types import SimpleNamespace

from agent_ui_creator.app_ui_model import (
    AppUIModelMutationError,
    AppUIModelMutationResult,
)
from agent_ui_creator.operations import (
    AddExistingPluginPlaybook,
    CompositionOperationVerificationService,
    CreatorDomainSnapshot,
    CreatorOperationRegistry,
    CreatorOperationResolution,
    PluginCapability,
    PluginCapabilityIndex,
    PluginDefaultPlacement,
    PluginInstanceSummary,
    RemovePluginPlaybook,
    RequiredServiceSummary,
)


class FakeValidation:
    def __init__(self, *, status: str = "passed") -> None:
        self.baseline_calls = 0
        self.validation_calls = 0
        self.status = status

    async def ensure_baseline(self):
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

    async def inspect(self) -> dict[str, object]:
        return await self.inspect_host()


class FakeMutation:
    def __init__(self, outcomes: list[object]) -> None:
        self.outcomes = iter(outcomes)
        self.calls: list[dict[str, object]] = []

    async def mutate(self, *, app_ui_model_hash: str, operations: list[dict[str, object]]):
        self.calls.append({"appUIModelHash": app_ui_model_hash, "operations": operations})
        outcome = next(self.outcomes)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome


class FakeSnapshotProvider:
    def __init__(self, snapshot: CreatorDomainSnapshot) -> None:
        self.snapshot = snapshot
        self.build_calls = 0

    async def build(self) -> CreatorDomainSnapshot:
        self.build_calls += 1
        return self.snapshot


class SequenceSnapshotProvider:
    def __init__(self, snapshots: list[CreatorDomainSnapshot]) -> None:
        self.snapshots = snapshots
        self.build_calls = 0

    async def build(self) -> CreatorDomainSnapshot:
        snapshot_index = min(self.build_calls, len(self.snapshots) - 1)
        self.build_calls += 1
        return self.snapshots[snapshot_index]


def snapshot(*plugins: PluginCapability) -> CreatorDomainSnapshot:
    return CreatorDomainSnapshot(
        raw={},
        app_ui_model_hash="a" * 64,
        capability_catalog_revision="b" * 64,
        observation_coverage=(),
        plugin_index=PluginCapabilityIndex(plugins=list(plugins)),
    )


def capability(
    plugin_id: str,
    *,
    selected: bool,
    instances: list[PluginInstanceSummary] | None = None,
    placement: bool = True,
    service_status: str = "resolved",
) -> PluginCapability:
    return PluginCapability(
        pluginId=plugin_id,
        name=plugin_id,
        description=f"{plugin_id} description",
        selected=selected,
        instances=instances or [],
        defaultPlacement=(
            PluginDefaultPlacement(
                relation="before",
                anchorPluginId="conversation-surface",
            )
            if placement
            else None
        ),
        requiredServices=RequiredServiceSummary(status=service_status),
    )


def mutation(
    *,
    operation: str,
    instance_id: str,
    after_hash: str = "c" * 64,
    expected_geometry: dict[str, object] | None = None,
) -> AppUIModelMutationResult:
    semantic = {
        "operation": operation,
        "semanticLoweringSucceeded": True,
        "expectedRuntime": {},
    }
    if operation == "insert_plugin_default":
        semantic["expectedRuntime"] = {"presentInstanceIds": [instance_id]}
        semantic["expectedGeometry"] = expected_geometry or {
            "instanceId": instance_id,
            "anchorInstanceId": "surface-main",
            "relation": "before",
            "axis": "width",
            "size": "280px",
        }
    else:
        semantic["expectedRuntime"] = {"absentInstanceIds": [instance_id]}
        semantic["reflow"] = "preserved-container"
    return AppUIModelMutationResult(
        {
            "schemaVersion": 1,
            "transactionId": "transaction",
            "changed": True,
            "changedPaths": ["app-ui/app-ui.json"],
            "appUIModel": {"beforeHash": "a" * 64, "afterHash": after_hash},
            "semanticComposition": semantic,
        },
        mutation_revision=1,
    )


def verification(
    runtime_results: list[dict[str, object]], *, validation_status: str = "passed"
):
    return CompositionOperationVerificationService(
        validation=FakeValidation(status=validation_status),
        runtime=FakeRuntime(runtime_results),
    )


def test_registry_does_not_fallback_to_unproductized_operations():
    registry = CreatorOperationRegistry({})

    assert registry.get("add_existing_plugin") is None
    assert registry.get("remove_plugin") is None
    assert registry.get("modify_plugin_logic") is None


def test_add_playbook_uses_one_host_mutation_and_no_model_calls():
    plugin_id = "conversation-thread-list"
    instance_id = f"{plugin_id}-main"
    source = snapshot(
        capability(plugin_id, selected=False),
        capability(
            "conversation-surface",
            selected=True,
            instances=[PluginInstanceSummary(instanceId="surface-main", enabled=True)],
        ),
    )
    mutation_service = FakeMutation(
        [
            mutation(
                operation="insert_plugin_default",
                instance_id=instance_id,
                expected_geometry={
                    "instanceId": instance_id,
                    "anchorInstanceId": "surface-main",
                    "relation": "before",
                    "axis": "width",
                    "size": "280px",
                },
            )
        ]
    )
    playbook = AddExistingPluginPlaybook(
        mutation_service=mutation_service,
        snapshot_provider=FakeSnapshotProvider(source),
        verification=verification(
            [
                {
                    "currentHash": "c" * 64,
                    "runtimeStatus": "passed",
                    "compositionFresh": True,
                    "compositionVerified": True,
                    "currentErrors": [],
                    "runtimeInstances": [
                        {
                            "instanceId": instance_id,
                            "rect": {"x": 0, "y": 0, "width": 280, "height": 800},
                        },
                        {
                            "instanceId": "surface-main",
                            "rect": {"x": 280, "y": 0, "width": 800, "height": 800},
                        },
                    ],
                }
            ]
        ),
    )

    result = asyncio.run(
        playbook.execute(
            source,
            CreatorOperationResolution(
                kind="add_existing_plugin",
                targetPluginIds=[plugin_id],
            ),
        )
    )

    assert result.status == "success"
    assert result.metrics.executionModelCalls == 0
    assert result.metrics.mutationAttempts == 1
    assert len(mutation_service.calls) == 1
    assert mutation_service.calls[0]["operations"][0]["type"] == "insert_plugin_default"


def test_add_playbook_does_not_enable_a_disabled_selected_plugin():
    source = snapshot(
        capability(
            "conversation-thread-list",
            selected=True,
            instances=[
                PluginInstanceSummary(
                    instanceId="conversation-thread-list-main", enabled=False
                )
            ],
        )
    )
    mutation_service = FakeMutation([])
    playbook = AddExistingPluginPlaybook(
        mutation_service=mutation_service,
        snapshot_provider=FakeSnapshotProvider(source),
        verification=verification([]),
    )

    result = asyncio.run(
        playbook.execute(
            source,
            CreatorOperationResolution(
                kind="add_existing_plugin",
                targetPluginIds=["conversation-thread-list"],
            ),
        )
    )

    assert result.status == "failed"
    assert result.errorCode == "PRODUCT_OPERATION_NOT_APPLICABLE"
    assert mutation_service.calls == []


def test_add_playbook_treats_an_enabled_instance_as_already_satisfied():
    plugin_id = "conversation-thread-list"
    instance_id = f"{plugin_id}-main"
    source = snapshot(
        capability(
            plugin_id,
            selected=True,
            instances=[PluginInstanceSummary(instanceId=instance_id, enabled=True)],
        )
    )
    mutation_service = FakeMutation([])
    playbook = AddExistingPluginPlaybook(
        mutation_service=mutation_service,
        snapshot_provider=FakeSnapshotProvider(source),
        verification=verification([]),
    )

    result = asyncio.run(
        playbook.execute(
            source,
            CreatorOperationResolution(
                kind="add_existing_plugin",
                targetPluginIds=[plugin_id],
            ),
        )
    )

    assert result.status == "already_satisfied"
    assert result.instanceId == instance_id
    assert mutation_service.calls == []


def test_add_playbook_rejects_missing_default_placement_as_not_applicable():
    plugin_id = "conversation-thread-list"
    source = snapshot(capability(plugin_id, selected=False, placement=False))
    mutation_service = FakeMutation([])
    playbook = AddExistingPluginPlaybook(
        mutation_service=mutation_service,
        snapshot_provider=FakeSnapshotProvider(source),
        verification=verification([]),
    )

    result = asyncio.run(
        playbook.execute(
            source,
            CreatorOperationResolution(
                kind="add_existing_plugin",
                targetPluginIds=[plugin_id],
            ),
        )
    )

    assert result.status == "failed"
    assert result.errorCode == "PRODUCT_OPERATION_NOT_APPLICABLE"
    assert mutation_service.calls == []


def test_add_playbook_rejects_unresolved_required_service_as_not_applicable():
    plugin_id = "conversation-thread-list"
    source = snapshot(
        capability(plugin_id, selected=False, service_status="unresolved")
    )
    mutation_service = FakeMutation([])
    playbook = AddExistingPluginPlaybook(
        mutation_service=mutation_service,
        snapshot_provider=FakeSnapshotProvider(source),
        verification=verification([]),
    )

    result = asyncio.run(
        playbook.execute(
            source,
            CreatorOperationResolution(
                kind="add_existing_plugin",
                targetPluginIds=[plugin_id],
            ),
        )
    )

    assert result.status == "failed"
    assert result.errorCode == "PRODUCT_OPERATION_NOT_APPLICABLE"
    assert mutation_service.calls == []


def test_add_playbook_normalizes_host_authoring_precondition():
    plugin_id = "conversation-thread-list"
    source = snapshot(
        capability(plugin_id, selected=False),
        capability(
            "conversation-surface",
            selected=True,
            instances=[PluginInstanceSummary(instanceId="surface-main", enabled=True)],
        ),
    )
    mutation_service = FakeMutation(
        [
            AppUIModelMutationError(
                "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
                "synthetic unsupported placement",
                {"anchorInstanceId": "surface-main"},
            )
        ]
    )
    playbook = AddExistingPluginPlaybook(
        mutation_service=mutation_service,
        snapshot_provider=FakeSnapshotProvider(source),
        verification=verification([]),
    )

    result = asyncio.run(
        playbook.execute(
            source,
            CreatorOperationResolution(
                kind="add_existing_plugin",
                targetPluginIds=[plugin_id],
            ),
        )
    )

    assert result.status == "failed"
    assert result.errorCode == "PRODUCT_OPERATION_NOT_APPLICABLE"
    assert result.details == {
        "anchorInstanceId": "surface-main",
        "causeCode": "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
    }


def test_add_playbook_rejects_invalid_host_semantic_result_before_verification():
    plugin_id = "conversation-thread-list"
    instance_id = f"{plugin_id}-main"
    source = snapshot(
        capability(plugin_id, selected=False),
        capability(
            "conversation-surface",
            selected=True,
            instances=[PluginInstanceSummary(instanceId="surface-main", enabled=True)],
        ),
    )
    mutation_service = FakeMutation(
        [mutation(operation="remove_plugin_default", instance_id=instance_id)]
    )
    playbook = AddExistingPluginPlaybook(
        mutation_service=mutation_service,
        snapshot_provider=FakeSnapshotProvider(source),
        verification=verification([]),
    )

    result = asyncio.run(
        playbook.execute(
            source,
            CreatorOperationResolution(
                kind="add_existing_plugin",
                targetPluginIds=[plugin_id],
            ),
        )
    )

    assert result.status == "failed"
    assert result.errorCode == "PRODUCT_OPERATION_RESULT_INVALID"
    assert result.verification is None


def test_remove_playbook_verifies_runtime_absence_without_model_execution():
    instance_id = "conversation-thread-list-main"
    plugin_id = "conversation-thread-list"
    source = snapshot(
        capability(
            plugin_id,
            selected=True,
            instances=[PluginInstanceSummary(instanceId=instance_id, enabled=True)],
        )
    )
    mutation_service = FakeMutation(
        [mutation(operation="remove_plugin_default", instance_id=instance_id)]
    )
    playbook = RemovePluginPlaybook(
        mutation_service=mutation_service,
        snapshot_provider=FakeSnapshotProvider(source),
        verification=verification(
            [
                {
                    "currentHash": "c" * 64,
                    "runtimeStatus": "passed",
                    "compositionFresh": True,
                    "compositionVerified": True,
                    "currentErrors": [],
                    "runtimeInstances": [],
                }
            ]
        ),
    )

    result = asyncio.run(
        playbook.execute(
            source,
            CreatorOperationResolution(
                kind="remove_plugin",
                targetPluginIds=[plugin_id],
                targetInstanceIds=[instance_id],
            ),
        )
    )

    assert result.status == "success"
    assert result.verification is not None
    assert result.verification.absentInstancesVerified == [instance_id]
    assert result.metrics.executionModelCalls == 0
    assert mutation_service.calls[0]["operations"][0]["type"] == "remove_plugin_default"


def test_remove_playbook_rejects_runtime_presence_of_removed_instance():
    instance_id = "conversation-thread-list-main"
    plugin_id = "conversation-thread-list"
    source = snapshot(
        capability(
            plugin_id,
            selected=True,
            instances=[PluginInstanceSummary(instanceId=instance_id, enabled=True)],
        )
    )
    mutation_service = FakeMutation(
        [mutation(operation="remove_plugin_default", instance_id=instance_id)]
    )
    playbook = RemovePluginPlaybook(
        mutation_service=mutation_service,
        snapshot_provider=FakeSnapshotProvider(source),
        verification=verification(
            [
                {
                    "currentHash": "c" * 64,
                    "runtimeStatus": "passed",
                    "compositionFresh": True,
                    "compositionVerified": True,
                    "currentErrors": [],
                    "runtimeInstances": [{"instanceId": instance_id}],
                }
            ]
        ),
    )

    result = asyncio.run(
        playbook.execute(
            source,
            CreatorOperationResolution(
                kind="remove_plugin",
                targetPluginIds=[plugin_id],
                targetInstanceIds=[instance_id],
            ),
        )
    )

    assert result.status == "failed"
    assert result.verification is not None
    assert result.verification.absentInstancesVerified == []


def test_remove_playbook_rejects_invalid_host_semantic_result_before_verification():
    instance_id = "conversation-thread-list-main"
    plugin_id = "conversation-thread-list"
    source = snapshot(
        capability(
            plugin_id,
            selected=True,
            instances=[PluginInstanceSummary(instanceId=instance_id, enabled=True)],
        )
    )
    invalid_mutation = mutation(
        operation="remove_plugin_default", instance_id=instance_id
    )
    del invalid_mutation.target_result["semanticComposition"]["reflow"]
    mutation_service = FakeMutation([invalid_mutation])
    playbook = RemovePluginPlaybook(
        mutation_service=mutation_service,
        snapshot_provider=FakeSnapshotProvider(source),
        verification=verification([]),
    )

    result = asyncio.run(
        playbook.execute(
            source,
            CreatorOperationResolution(
                kind="remove_plugin",
                targetPluginIds=[plugin_id],
                targetInstanceIds=[instance_id],
            ),
        )
    )

    assert result.status == "failed"
    assert result.errorCode == "PRODUCT_OPERATION_RESULT_INVALID"
    assert result.verification is None


def test_remove_playbook_treats_absent_target_as_idempotent():
    source = snapshot(capability("conversation-thread-list", selected=False))
    mutation_service = FakeMutation([])
    playbook = RemovePluginPlaybook(
        mutation_service=mutation_service,
        snapshot_provider=FakeSnapshotProvider(source),
        verification=verification([]),
    )

    result = asyncio.run(
        playbook.execute(
            source,
            CreatorOperationResolution(
                kind="remove_plugin",
                targetPluginIds=["conversation-thread-list"],
                targetInstanceIds=[],
            ),
        )
    )

    assert result.status == "already_satisfied"
    assert result.instanceId is None
    assert mutation_service.calls == []


def test_remove_playbook_refreshes_once_on_hash_conflict_without_model_execution():
    instance_id = "conversation-thread-list-main"
    plugin_id = "conversation-thread-list"
    source = snapshot(
        capability(
            plugin_id,
            selected=True,
            instances=[PluginInstanceSummary(instanceId=instance_id, enabled=True)],
        )
    )
    mutation_service = FakeMutation(
        [
            AppUIModelMutationError(
                "APP_UI_MODEL_HASH_CONFLICT",
                "synthetic hash conflict",
            ),
            mutation(operation="remove_plugin_default", instance_id=instance_id),
        ]
    )
    provider = FakeSnapshotProvider(source)
    playbook = RemovePluginPlaybook(
        mutation_service=mutation_service,
        snapshot_provider=provider,
        verification=verification(
            [
                {
                    "currentHash": "c" * 64,
                    "runtimeStatus": "passed",
                    "compositionFresh": True,
                    "compositionVerified": True,
                    "currentErrors": [],
                    "runtimeInstances": [],
                }
            ]
        ),
    )

    result = asyncio.run(
        playbook.execute(
            source,
            CreatorOperationResolution(
                kind="remove_plugin",
                targetPluginIds=[plugin_id],
                targetInstanceIds=[instance_id],
            ),
        )
    )

    assert result.status == "success"
    assert result.metrics.executionModelCalls == 0
    assert result.metrics.snapshotRefreshes == 1
    assert result.metrics.mutationAttempts == 2
    assert provider.build_calls == 1


def test_remove_playbook_rejects_replaced_instance_after_hash_conflict_as_stale():
    instance_id = "conversation-thread-list-main"
    plugin_id = "conversation-thread-list"
    source = snapshot(
        capability(
            plugin_id,
            selected=True,
            instances=[PluginInstanceSummary(instanceId=instance_id, enabled=True)],
        )
    )
    refreshed = snapshot(
        capability(
            plugin_id,
            selected=True,
            instances=[
                PluginInstanceSummary(
                    instanceId="conversation-thread-list-replacement", enabled=True
                )
            ],
        )
    )
    mutation_service = FakeMutation(
        [
            AppUIModelMutationError(
                "APP_UI_MODEL_HASH_CONFLICT",
                "synthetic hash conflict",
            )
        ]
    )
    provider = SequenceSnapshotProvider([refreshed])
    playbook = RemovePluginPlaybook(
        mutation_service=mutation_service,
        snapshot_provider=provider,
        verification=verification([]),
    )

    result = asyncio.run(
        playbook.execute(
            source,
            CreatorOperationResolution(
                kind="remove_plugin",
                targetPluginIds=[plugin_id],
                targetInstanceIds=[instance_id],
            ),
        )
    )

    assert result.status == "failed"
    assert result.errorCode == "PRODUCT_OPERATION_STALE"
    assert result.metrics.mutationAttempts == 1
    assert result.metrics.snapshotRefreshes == 1
    assert provider.build_calls == 1
    assert mutation_service.calls[0]["operations"][0]["instanceId"] == instance_id


def test_productized_verification_stops_before_runtime_when_static_validation_fails():
    plugin_id = "conversation-thread-list"
    instance_id = f"{plugin_id}-main"
    source = snapshot(
        capability(plugin_id, selected=False),
        capability(
            "conversation-surface",
            selected=True,
            instances=[PluginInstanceSummary(instanceId="surface-main", enabled=True)],
        ),
    )
    mutation_service = FakeMutation(
        [mutation(operation="insert_plugin_default", instance_id=instance_id)]
    )
    validation = FakeValidation(status="failed")
    runtime = FakeRuntime([])
    playbook = AddExistingPluginPlaybook(
        mutation_service=mutation_service,
        snapshot_provider=FakeSnapshotProvider(source),
        verification=CompositionOperationVerificationService(
            validation=validation,
            runtime=runtime,
        ),
    )

    result = asyncio.run(
        playbook.execute(
            source,
            CreatorOperationResolution(
                kind="add_existing_plugin",
                targetPluginIds=[plugin_id],
            ),
        )
    )

    assert result.status == "failed"
    assert result.verification is not None
    assert result.verification.staticStatus == "failed"
    assert result.verification.runtimeStatus == "not-run"
    assert runtime.inspect_calls == 0


def test_add_playbook_refreshes_once_on_hash_conflict_without_re_resolving():
    plugin_id = "conversation-thread-list"
    source = snapshot(
        capability(plugin_id, selected=False),
        capability(
            "conversation-surface",
            selected=True,
            instances=[PluginInstanceSummary(instanceId="surface-main", enabled=True)],
        ),
    )
    mutation_service = FakeMutation(
        [
            AppUIModelMutationError(
                "APP_UI_MODEL_HASH_CONFLICT",
                "synthetic hash conflict",
            ),
            mutation(
                operation="insert_plugin_default",
                instance_id=f"{plugin_id}-main",
            ),
        ]
    )
    provider = FakeSnapshotProvider(source)
    playbook = AddExistingPluginPlaybook(
        mutation_service=mutation_service,
        snapshot_provider=provider,
        verification=verification(
            [
                {
                    "currentHash": "c" * 64,
                    "runtimeStatus": "stale",
                    "compositionFresh": False,
                },
                {
                    "currentHash": "c" * 64,
                    "runtimeStatus": "stale",
                    "compositionFresh": False,
                },
                {
                    "currentHash": "c" * 64,
                    "runtimeStatus": "stale",
                    "compositionFresh": False,
                },
            ]
        ),
    )

    result = asyncio.run(
        playbook.execute(
            source,
            CreatorOperationResolution(
                kind="add_existing_plugin",
                targetPluginIds=[plugin_id],
            ),
        )
    )

    assert result.status == "committed_unverified"
    assert result.metrics.snapshotRefreshes == 1
    assert result.metrics.mutationAttempts == 2
    assert provider.build_calls == 1
