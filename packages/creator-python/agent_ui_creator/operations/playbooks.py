from __future__ import annotations

from collections.abc import Mapping
from time import monotonic
from typing import Any, Protocol

from ..app_ui_model import AppUIModelMutationError, AppUIModelMutationService
from .models import (
    CreatorDomainSnapshot,
    CreatorOperationExecutionResult,
    CreatorOperationMetrics,
    CreatorOperationResolution,
    CreatorOperationVerificationResult,
    MAX_PLUGIN_INSTANCE_ID_CHARS,
    PluginCapability,
)
from .snapshot import CreatorDomainSnapshotProvider
from .verification import CompositionOperationVerificationService


_AUTHORING_DEFAULT_PRECONDITION_PREFIX = "AUTHORING_DEFAULT_PLACEMENT_"
_PRODUCTIZED_SEMANTIC_OPERATIONS = {
    "add_existing_plugin": "insert_plugin_default",
    "remove_plugin": "remove_plugin_default",
}


class ProductizedOperationPlaybook(Protocol):
    async def execute(
        self,
        snapshot: CreatorDomainSnapshot,
        resolution: CreatorOperationResolution,
    ) -> CreatorOperationExecutionResult: ...


def _capability(
    snapshot: CreatorDomainSnapshot, plugin_id: str
) -> PluginCapability | None:
    return next(
        (
            plugin
            for plugin in snapshot.plugin_index.plugins
            if plugin.pluginId == plugin_id
        ),
        None,
    )


def _instance_owner(
    snapshot: CreatorDomainSnapshot, instance_id: str
) -> str | None:
    for plugin in snapshot.plugin_index.plugins:
        if any(instance.instanceId == instance_id for instance in plugin.instances):
            return plugin.pluginId
    return None


class _PlaybookBase:
    operation: str

    @staticmethod
    def _metrics(
        started_at: float,
        *,
        mutation_attempts: int,
        snapshot_refreshes: int,
        verification_attempts: int,
    ) -> CreatorOperationMetrics:
        return CreatorOperationMetrics(
            operationDurationMs=max(0, round((monotonic() - started_at) * 1_000)),
            executionModelCalls=0,
            mutationAttempts=mutation_attempts,
            snapshotRefreshes=snapshot_refreshes,
            verificationRuntimeFreshnessAttempts=verification_attempts,
        )

    def _result(
        self,
        started_at: float,
        *,
        status: str,
        plugin_id: str | None,
        instance_id: str | None,
        mutation_changed: bool = False,
        mutation_revision: int | None = None,
        verification: CreatorOperationVerificationResult | None = None,
        error_code: str | None = None,
        message: str | None = None,
        details: Any = None,
        mutation_attempts: int = 0,
        snapshot_refreshes: int = 0,
    ) -> CreatorOperationExecutionResult:
        return CreatorOperationExecutionResult(
            operation=self.operation,  # type: ignore[arg-type]
            status=status,  # type: ignore[arg-type]
            pluginId=plugin_id,
            instanceId=instance_id,
            mutationChanged=mutation_changed,
            mutationRevision=mutation_revision,
            verification=verification,
            metrics=self._metrics(
                started_at,
                mutation_attempts=mutation_attempts,
                snapshot_refreshes=snapshot_refreshes,
                verification_attempts=(
                    0
                    if verification is None
                    else verification.runtimeFreshnessAttempts
                ),
            ),
            errorCode=error_code,
            message=message,
            details=details,
        )

    @staticmethod
    def _semantic_expectations(
        mutation: Mapping[str, Any],
        *,
        operation: str,
        instance_id: str,
    ) -> tuple[Mapping[str, Any], Mapping[str, Any] | None] | None:
        semantic = mutation.get("semanticComposition")
        expected_operation = _PRODUCTIZED_SEMANTIC_OPERATIONS.get(operation)
        if (
            not isinstance(semantic, Mapping)
            or semantic.get("operation") != expected_operation
            or semantic.get("semanticLoweringSucceeded") is not True
        ):
            return None
        expected_runtime = semantic.get("expectedRuntime")
        if not isinstance(expected_runtime, Mapping):
            return None

        if operation == "add_existing_plugin":
            if (
                expected_runtime.get("presentInstanceIds") != [instance_id]
                or expected_runtime.get("absentInstanceIds", []) != []
            ):
                return None
            expected_geometry = semantic.get("expectedGeometry")
            if (
                not isinstance(expected_geometry, Mapping)
                or expected_geometry.get("instanceId") != instance_id
            ):
                return None
            return expected_runtime, expected_geometry

        if (
            expected_runtime.get("absentInstanceIds") != [instance_id]
            or expected_runtime.get("presentInstanceIds", []) != []
            or semantic.get("reflow")
            not in {"collapsed-dedicated-region", "preserved-container"}
        ):
            return None
        return expected_runtime, None

    async def _verify_committed(
        self,
        started_at: float,
        *,
        mutation: Mapping[str, Any],
        plugin_id: str,
        instance_id: str,
        mutation_attempts: int,
        snapshot_refreshes: int,
    ) -> CreatorOperationExecutionResult:
        changed = mutation.get("changed") is True
        revision = mutation.get("mutationRevision")
        mutation_revision = revision if isinstance(revision, int) else None
        if not changed:
            return self._result(
                started_at,
                status="already_satisfied",
                plugin_id=plugin_id,
                instance_id=instance_id,
                mutation_changed=False,
                mutation_revision=mutation_revision,
                mutation_attempts=mutation_attempts,
                snapshot_refreshes=snapshot_refreshes,
            )
        semantic_expectations = self._semantic_expectations(
            mutation,
            operation=self.operation,
            instance_id=instance_id,
        )
        if semantic_expectations is None:
            return self._result(
                started_at,
                status="failed",
                plugin_id=plugin_id,
                instance_id=instance_id,
                mutation_changed=True,
                mutation_revision=mutation_revision,
                error_code="PRODUCT_OPERATION_RESULT_INVALID",
                message="The Host mutation did not return valid Productized semantic expectations.",
                mutation_attempts=mutation_attempts,
                snapshot_refreshes=snapshot_refreshes,
            )
        expected_runtime, expected_geometry = semantic_expectations

        verification = await self.verification.verify(
            mutation_result=mutation,
            expected_runtime=expected_runtime,
            expected_geometry=expected_geometry,
        )
        if (
            verification.staticStatus == "passed"
            and verification.runtimeStatus == "passed"
        ):
            status = "success"
        elif verification.runtimeStatus in {"stale", "unavailable"}:
            status = "committed_unverified"
        else:
            status = "failed"
        return self._result(
            started_at,
            status=status,
            plugin_id=plugin_id,
            instance_id=instance_id,
            mutation_changed=True,
            mutation_revision=mutation_revision,
            verification=verification,
            mutation_attempts=mutation_attempts,
            snapshot_refreshes=snapshot_refreshes,
        )

    def _mutation_failure(
        self,
        started_at: float,
        *,
        plugin_id: str,
        instance_id: str,
        error: Exception,
        mutation_attempts: int,
        snapshot_refreshes: int,
        normalize_authoring_precondition: bool = False,
    ) -> CreatorOperationExecutionResult:
        changed = (
            error.state_changed
            if isinstance(error, AppUIModelMutationError)
            else False
        )
        error_code = getattr(error, "code", type(error).__name__)
        details = getattr(error, "details", None)
        if (
            normalize_authoring_precondition
            and isinstance(error, AppUIModelMutationError)
            and not error.state_changed
            and error_code.startswith(_AUTHORING_DEFAULT_PRECONDITION_PREFIX)
        ):
            cause_details = details
            details = (
                {**cause_details, "causeCode": error_code}
                if isinstance(cause_details, Mapping)
                else {
                    "causeCode": error_code,
                    **(
                        {"causeDetails": cause_details}
                        if cause_details is not None
                        else {}
                    ),
                }
            )
            error_code = "PRODUCT_OPERATION_NOT_APPLICABLE"
        return self._result(
            started_at,
            status="failed",
            plugin_id=plugin_id,
            instance_id=instance_id,
            mutation_changed=changed,
            error_code=error_code,
            message=str(error),
            details=details,
            mutation_attempts=mutation_attempts,
            snapshot_refreshes=snapshot_refreshes,
        )


class AddExistingPluginPlaybook(_PlaybookBase):
    """Deterministically add one existing visual Plugin at its default placement."""

    operation = "add_existing_plugin"

    def __init__(
        self,
        *,
        mutation_service: AppUIModelMutationService,
        snapshot_provider: CreatorDomainSnapshotProvider,
        verification: CompositionOperationVerificationService,
    ) -> None:
        self.mutation_service = mutation_service
        self.snapshot_provider = snapshot_provider
        self.verification = verification

    @staticmethod
    def _eligibility(
        snapshot: CreatorDomainSnapshot,
        plugin_id: str,
    ) -> tuple[str, PluginCapability | None, str | None]:
        plugin = _capability(snapshot, plugin_id)
        if plugin is None:
            return "not-applicable", None, "The requested Plugin does not exist."
        if plugin.selected:
            if any(instance.enabled for instance in plugin.instances):
                return "already-satisfied", plugin, None
            return (
                "not-applicable",
                plugin,
                "The Plugin is selected only through a disabled instance; enabling it is not Productized in this Commit.",
            )
        if plugin.instances:
            return (
                "not-applicable",
                plugin,
                "The Plugin is unselected but still has authoring instances.",
            )
        if plugin.defaultPlacement is None:
            return (
                "not-applicable",
                plugin,
                "The Plugin does not declare a default placement.",
            )
        service_status = (
            None
            if plugin.requiredServices is None
            else plugin.requiredServices.status
        )
        if service_status not in {"resolved", "not-required"}:
            return (
                "not-applicable",
                plugin,
                "The Plugin required Services are not resolved for Productized insertion.",
            )
        instance_id = f"{plugin_id}-main"
        if (
            len(instance_id) > MAX_PLUGIN_INSTANCE_ID_CHARS
            or _instance_owner(snapshot, instance_id) is not None
        ):
            return (
                "not-applicable",
                plugin,
                "The Productized default instance id is unavailable.",
            )
        return "eligible", plugin, None

    async def execute(
        self,
        snapshot: CreatorDomainSnapshot,
        resolution: CreatorOperationResolution,
    ) -> CreatorOperationExecutionResult:
        started_at = monotonic()
        plugin_id = (
            resolution.targetPluginIds[0]
            if len(resolution.targetPluginIds) == 1
            else None
        )
        instance_id = None if plugin_id is None else f"{plugin_id}-main"
        if (
            resolution.kind != self.operation
            or len(resolution.targetPluginIds) != 1
            or resolution.targetInstanceIds
        ):
            return self._result(
                started_at,
                status="failed",
                plugin_id=plugin_id,
                instance_id=instance_id,
                error_code="PRODUCT_OPERATION_INPUT_INVALID",
                message="add_existing_plugin requires exactly one Plugin target and no instance target.",
            )

        eligibility, plugin, reason = self._eligibility(snapshot, plugin_id)
        if eligibility == "already-satisfied":
            return self._result(
                started_at,
                status="already_satisfied",
                plugin_id=plugin_id,
                instance_id=(
                    next(
                        instance.instanceId
                        for instance in plugin.instances
                        if instance.enabled
                    )
                    if plugin is not None
                    else instance_id
                ),
            )
        if eligibility != "eligible" or plugin is None:
            return self._result(
                started_at,
                status="failed",
                plugin_id=plugin_id,
                instance_id=instance_id,
                error_code="PRODUCT_OPERATION_NOT_APPLICABLE",
                message=reason,
            )

        try:
            await self.verification.ensure_baseline()
        except Exception as error:
            return self._result(
                started_at,
                status="failed",
                plugin_id=plugin_id,
                instance_id=instance_id,
                error_code="PRODUCT_OPERATION_STATIC_BASELINE_FAILED",
                message=str(error),
            )
        current_snapshot = snapshot
        mutation_attempts = 0
        snapshot_refreshes = 0
        while True:
            mutation_attempts += 1
            try:
                mutation_result = await self.mutation_service.mutate(
                    app_ui_model_hash=current_snapshot.app_ui_model_hash,
                    operations=[
                        {
                            "type": "insert_plugin_default",
                            "plugin": {
                                "id": instance_id,
                                "pluginId": plugin_id,
                                "enabled": True,
                            },
                        }
                    ],
                )
            except AppUIModelMutationError as error:
                if error.code != "APP_UI_MODEL_HASH_CONFLICT" or snapshot_refreshes >= 1:
                    return self._mutation_failure(
                        started_at,
                        plugin_id=plugin_id,
                        instance_id=instance_id,
                        error=error,
                        mutation_attempts=mutation_attempts,
                        snapshot_refreshes=snapshot_refreshes,
                        normalize_authoring_precondition=True,
                    )
                snapshot_refreshes += 1
                try:
                    current_snapshot = await self.snapshot_provider.build()
                except Exception as refresh_error:
                    return self._result(
                        started_at,
                        status="failed",
                        plugin_id=plugin_id,
                        instance_id=instance_id,
                        error_code="PRODUCT_OPERATION_SNAPSHOT_REFRESH_FAILED",
                        message=str(refresh_error),
                        mutation_attempts=mutation_attempts,
                        snapshot_refreshes=snapshot_refreshes,
                    )
                refreshed_eligibility, refreshed_plugin, refreshed_reason = self._eligibility(
                    current_snapshot, plugin_id
                )
                if refreshed_eligibility == "already-satisfied":
                    return self._result(
                        started_at,
                        status="already_satisfied",
                        plugin_id=plugin_id,
                        instance_id=instance_id,
                        mutation_attempts=mutation_attempts,
                        snapshot_refreshes=snapshot_refreshes,
                    )
                if refreshed_eligibility != "eligible" or refreshed_plugin is None:
                    return self._result(
                        started_at,
                        status="failed",
                        plugin_id=plugin_id,
                        instance_id=instance_id,
                        error_code="PRODUCT_OPERATION_STALE",
                        message=refreshed_reason,
                        mutation_attempts=mutation_attempts,
                        snapshot_refreshes=snapshot_refreshes,
                    )
                continue
            except Exception as error:
                return self._mutation_failure(
                    started_at,
                    plugin_id=plugin_id,
                    instance_id=instance_id,
                    error=error,
                    mutation_attempts=mutation_attempts,
                    snapshot_refreshes=snapshot_refreshes,
                    normalize_authoring_precondition=True,
                )

            return await self._verify_committed(
                started_at,
                mutation=mutation_result.to_dict(),
                plugin_id=plugin_id,
                instance_id=instance_id,
                mutation_attempts=mutation_attempts,
                snapshot_refreshes=snapshot_refreshes,
            )


class RemovePluginPlaybook(_PlaybookBase):
    """Deterministically remove one Plugin instance with Host-owned reflow."""

    operation = "remove_plugin"

    def __init__(
        self,
        *,
        mutation_service: AppUIModelMutationService,
        snapshot_provider: CreatorDomainSnapshotProvider,
        verification: CompositionOperationVerificationService,
    ) -> None:
        self.mutation_service = mutation_service
        self.snapshot_provider = snapshot_provider
        self.verification = verification

    @staticmethod
    def _eligibility(
        snapshot: CreatorDomainSnapshot,
        plugin_id: str,
        instance_id: str,
    ) -> tuple[str, PluginCapability | None, str | None]:
        owner = _instance_owner(snapshot, instance_id)
        if owner is None:
            plugin = _capability(snapshot, plugin_id)
            if plugin is not None and plugin.instances:
                return (
                    "stale",
                    plugin,
                    "The target instance is gone, but the target Plugin now has a different instance.",
                )
            return "already-satisfied", plugin, None
        if owner != plugin_id:
            return (
                "stale",
                _capability(snapshot, plugin_id),
                "The target instance is now owned by a different Plugin.",
            )
        plugin = _capability(snapshot, plugin_id)
        if plugin is None:
            return "stale", None, "The target Plugin capability is no longer available."
        return "eligible", plugin, None

    async def execute(
        self,
        snapshot: CreatorDomainSnapshot,
        resolution: CreatorOperationResolution,
    ) -> CreatorOperationExecutionResult:
        started_at = monotonic()
        plugin_id = (
            resolution.targetPluginIds[0]
            if len(resolution.targetPluginIds) == 1
            else None
        )
        instance_id = (
            resolution.targetInstanceIds[0]
            if len(resolution.targetInstanceIds) == 1
            else None
        )
        if (
            resolution.kind != self.operation
            or len(resolution.targetPluginIds) != 1
            or len(resolution.targetInstanceIds) > 1
        ):
            return self._result(
                started_at,
                status="failed",
                plugin_id=plugin_id,
                instance_id=instance_id,
                error_code="PRODUCT_OPERATION_INPUT_INVALID",
                message="remove_plugin requires exactly one Plugin and at most one instance target.",
            )

        plugin = _capability(snapshot, plugin_id)
        if plugin is None:
            return self._result(
                started_at,
                status="failed",
                plugin_id=plugin_id,
                instance_id=instance_id,
                error_code="PRODUCT_OPERATION_INPUT_INVALID",
                message="remove_plugin requires a Plugin present in the current snapshot.",
            )
        if instance_id is None:
            if plugin.instances:
                return self._result(
                    started_at,
                    status="failed",
                    plugin_id=plugin_id,
                    instance_id=None,
                    error_code="PRODUCT_OPERATION_INPUT_INVALID",
                    message="remove_plugin requires one instance target when the Plugin is mounted.",
                )
            return self._result(
                started_at,
                status="already_satisfied",
                plugin_id=plugin_id,
                instance_id=None,
            )
        if not plugin.instances:
            return self._result(
                started_at,
                status="failed",
                plugin_id=plugin_id,
                instance_id=instance_id,
                error_code="PRODUCT_OPERATION_INPUT_INVALID",
                message="remove_plugin cannot target an instance when the Plugin is not mounted.",
            )

        eligibility, _plugin, reason = self._eligibility(
            snapshot, plugin_id, instance_id
        )
        if eligibility == "already-satisfied":
            return self._result(
                started_at,
                status="already_satisfied",
                plugin_id=plugin_id,
                instance_id=instance_id,
            )
        if eligibility != "eligible":
            return self._result(
                started_at,
                status="failed",
                plugin_id=plugin_id,
                instance_id=instance_id,
                error_code="PRODUCT_OPERATION_STALE",
                message=reason,
            )

        try:
            await self.verification.ensure_baseline()
        except Exception as error:
            return self._result(
                started_at,
                status="failed",
                plugin_id=plugin_id,
                instance_id=instance_id,
                error_code="PRODUCT_OPERATION_STATIC_BASELINE_FAILED",
                message=str(error),
            )
        current_snapshot = snapshot
        mutation_attempts = 0
        snapshot_refreshes = 0
        while True:
            mutation_attempts += 1
            try:
                mutation_result = await self.mutation_service.mutate(
                    app_ui_model_hash=current_snapshot.app_ui_model_hash,
                    operations=[
                        {
                            "type": "remove_plugin_default",
                            "instanceId": instance_id,
                        }
                    ],
                )
            except AppUIModelMutationError as error:
                if error.code != "APP_UI_MODEL_HASH_CONFLICT" or snapshot_refreshes >= 1:
                    return self._mutation_failure(
                        started_at,
                        plugin_id=plugin_id,
                        instance_id=instance_id,
                        error=error,
                        mutation_attempts=mutation_attempts,
                        snapshot_refreshes=snapshot_refreshes,
                    )
                snapshot_refreshes += 1
                try:
                    current_snapshot = await self.snapshot_provider.build()
                except Exception as refresh_error:
                    return self._result(
                        started_at,
                        status="failed",
                        plugin_id=plugin_id,
                        instance_id=instance_id,
                        error_code="PRODUCT_OPERATION_SNAPSHOT_REFRESH_FAILED",
                        message=str(refresh_error),
                        mutation_attempts=mutation_attempts,
                        snapshot_refreshes=snapshot_refreshes,
                    )
                refreshed_eligibility, _refreshed_plugin, refreshed_reason = self._eligibility(
                    current_snapshot, plugin_id, instance_id
                )
                if refreshed_eligibility == "already-satisfied":
                    return self._result(
                        started_at,
                        status="already_satisfied",
                        plugin_id=plugin_id,
                        instance_id=instance_id,
                        mutation_attempts=mutation_attempts,
                        snapshot_refreshes=snapshot_refreshes,
                    )
                if refreshed_eligibility != "eligible":
                    return self._result(
                        started_at,
                        status="failed",
                        plugin_id=plugin_id,
                        instance_id=instance_id,
                        error_code="PRODUCT_OPERATION_STALE",
                        message=refreshed_reason,
                        mutation_attempts=mutation_attempts,
                        snapshot_refreshes=snapshot_refreshes,
                    )
                continue
            except Exception as error:
                return self._mutation_failure(
                    started_at,
                    plugin_id=plugin_id,
                    instance_id=instance_id,
                    error=error,
                    mutation_attempts=mutation_attempts,
                    snapshot_refreshes=snapshot_refreshes,
                )

            return await self._verify_committed(
                started_at,
                mutation=mutation_result.to_dict(),
                plugin_id=plugin_id,
                instance_id=instance_id,
                mutation_attempts=mutation_attempts,
                snapshot_refreshes=snapshot_refreshes,
            )
