from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from time import monotonic
from typing import Any

from ..app_ui_model import AppUIModelMutationError, AppUIModelMutationService
from .models import (
    CreatorActionCandidate,
    CreatorDomainSnapshot,
    CreatorOperationExecutionResult,
    CreatorOperationMetrics,
    CreatorOperationVerificationResult,
)
from .snapshot import CreatorDomainSnapshotProvider
from .verification import CompositionOperationVerificationService


_SEMANTIC_OPERATIONS = {
    "add_existing_plugin": "insert_plugin_default",
    "remove_plugin": "remove_plugin_default",
    "move_plugin": "move_plugin_to",
}
_STALE_ACTION_ERROR_CODES = frozenset(
    {"APP_UI_MODEL_HASH_CONFLICT", "CREATOR_ACTION_NOT_AVAILABLE"}
)


class _HostResultInvalid(ValueError):
    def __init__(self, message: str, details: Mapping[str, Any] | None = None) -> None:
        super().__init__(message)
        self.details = dict(details or {})


@dataclass(frozen=True, slots=True)
class _HostExpectations:
    expected_runtime: Mapping[str, Any]
    expected_geometry: Mapping[str, Any] | None
    expected_placement: Mapping[str, Any] | None
    expected_workspace_fill: list[Mapping[str, Any]] | None
    instance_id: str | None


def _required_mapping(value: Any, name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise _HostResultInvalid(
            f"Host mutation result {name} must be an object.",
            {"field": name},
        )
    return value


def _string_list(
    value: Any,
    name: str,
    *,
    default: list[str] | None = None,
) -> list[str]:
    if value is None:
        return list(default or [])
    if not isinstance(value, list) or not all(
        isinstance(item, str) and item.strip() for item in value
    ):
        raise _HostResultInvalid(
            f"Host mutation result {name} must be an array of non-empty strings.",
            {"field": name},
        )
    return list(value)


def _validate_expected_placement(
    value: Any,
    *,
    instance_id: str,
    required: bool,
) -> Mapping[str, Any] | None:
    if value is None:
        if required:
            raise _HostResultInvalid(
                "Host mutation result expectedPlacement is required.",
                {"field": "semanticComposition.expectedPlacement"},
            )
        return None
    placement = _required_mapping(value, "semanticComposition.expectedPlacement")
    if placement.get("instanceId") != instance_id:
        raise _HostResultInvalid(
            "Host mutation result expectedPlacement targets the wrong instance.",
            {
                "field": "semanticComposition.expectedPlacement.instanceId",
                "expected": instance_id,
                "actual": placement.get("instanceId"),
            },
        )
    placement_type = placement.get("type")
    if placement_type == "relative":
        if (
            not isinstance(placement.get("anchorInstanceId"), str)
            or placement.get("relation") not in {"before", "after"}
        ):
            raise _HostResultInvalid(
                "Host mutation result relative expectedPlacement is invalid.",
                {"field": "semanticComposition.expectedPlacement"},
            )
    elif placement_type == "plugin_slot":
        if not isinstance(placement.get("parentInstanceId"), str) or not isinstance(
            placement.get("slot"), str
        ):
            raise _HostResultInvalid(
                "Host mutation result Plugin Slot expectedPlacement is invalid.",
                {"field": "semanticComposition.expectedPlacement"},
            )
    else:
        raise _HostResultInvalid(
            "Host mutation result expectedPlacement has an unsupported type.",
            {"field": "semanticComposition.expectedPlacement.type"},
        )
    return placement


def _validate_host_result(
    mutation: Mapping[str, Any], candidate: CreatorActionCandidate
) -> _HostExpectations:
    changed = mutation.get("changed")
    if not isinstance(changed, bool):
        raise _HostResultInvalid(
            "Host mutation result changed must be a boolean.",
            {"field": "changed"},
        )

    expected_status = "ready" if changed else "already_satisfied"
    creator_action = _required_mapping(mutation.get("creatorAction"), "creatorAction")
    if creator_action.get("actionId") != candidate.actionId:
        raise _HostResultInvalid(
            "Host mutation result creatorAction.actionId does not match the selected action.",
            {
                "field": "creatorAction.actionId",
                "selectedActionId": candidate.actionId,
                "actualActionId": creator_action.get("actionId"),
            },
        )
    if creator_action.get("actionKind") != candidate.kind:
        raise _HostResultInvalid(
            "Host mutation result creatorAction.actionKind does not match the current Action Candidate.",
            {
                "field": "creatorAction.actionKind",
                "selectedActionKind": candidate.kind,
                "actualActionKind": creator_action.get("actionKind"),
            },
        )
    if creator_action.get("status") != expected_status:
        raise _HostResultInvalid(
            "Host mutation result creatorAction.status is inconsistent with changed.",
            {
                "field": "creatorAction.status",
                "changed": changed,
                "expectedStatus": expected_status,
                "actualStatus": creator_action.get("status"),
            },
        )

    semantic = _required_mapping(
        mutation.get("semanticComposition"), "semanticComposition"
    )
    expected_operation = (
        "insert_plugin_to"
        if candidate.kind == "add_existing_plugin" and candidate.effect.type == "workspace_region"
        else _SEMANTIC_OPERATIONS[candidate.kind]
    )
    if semantic.get("actionId") != candidate.actionId:
        raise _HostResultInvalid(
            "Host mutation result semanticComposition.actionId does not match the selected action.",
            {
                "field": "semanticComposition.actionId",
                "selectedActionId": candidate.actionId,
                "actualActionId": semantic.get("actionId"),
            },
        )
    if semantic.get("actionKind") != candidate.kind:
        raise _HostResultInvalid(
            "Host mutation result semanticComposition.actionKind does not match the current Action Candidate.",
            {
                "field": "semanticComposition.actionKind",
                "selectedActionKind": candidate.kind,
                "actualActionKind": semantic.get("actionKind"),
            },
        )
    if semantic.get("actionStatus") != expected_status:
        raise _HostResultInvalid(
            "Host mutation result semanticComposition.actionStatus is inconsistent with changed.",
            {
                "field": "semanticComposition.actionStatus",
                "changed": changed,
                "expectedStatus": expected_status,
                "actualStatus": semantic.get("actionStatus"),
            },
        )
    if semantic.get("operation") != expected_operation:
        raise _HostResultInvalid(
            "Host mutation result semantic operation does not match the Action Candidate kind.",
            {
                "field": "semanticComposition.operation",
                "expectedOperation": expected_operation,
                "actualOperation": semantic.get("operation"),
            },
        )
    if semantic.get("semanticLoweringSucceeded") is not True:
        raise _HostResultInvalid(
            "Host mutation result semantic lowering did not succeed.",
            {"field": "semanticComposition.semanticLoweringSucceeded"},
        )

    expected_runtime = _required_mapping(
        semantic.get("expectedRuntime"), "semanticComposition.expectedRuntime"
    )
    present = _string_list(
        expected_runtime.get("presentInstanceIds"),
        "semanticComposition.expectedRuntime.presentInstanceIds",
    )
    absent = _string_list(
        expected_runtime.get("absentInstanceIds"),
        "semanticComposition.expectedRuntime.absentInstanceIds",
    )
    normalized_runtime = {
        "presentInstanceIds": present,
        "absentInstanceIds": absent,
    }
    expected_geometry: Mapping[str, Any] | None = None
    expected_placement: Mapping[str, Any] | None = None
    expected_workspace_fill: list[Mapping[str, Any]] | None = None
    raw_workspace_fill = semantic.get("expectedWorkspaceFill")
    if raw_workspace_fill is not None:
        if not isinstance(raw_workspace_fill, list) or not raw_workspace_fill or len(raw_workspace_fill) > 3:
            raise _HostResultInvalid(
                "Host mutation result expectedWorkspaceFill is invalid.",
                {"field": "semanticComposition.expectedWorkspaceFill"},
            )
        expected_workspace_fill = []
        for item in raw_workspace_fill:
            if (
                not isinstance(item, Mapping)
                or not isinstance(item.get("instanceId"), str)
                or item.get("region") not in {"left", "center", "right"}
                or item.get("axis") != "width"
                or not isinstance(item.get("trackIndex"), int)
                or isinstance(item.get("trackIndex"), bool)
                or item["trackIndex"] not in {0, 1, 2}
            ):
                raise _HostResultInvalid(
                    "Host mutation result expectedWorkspaceFill entry is invalid.",
                    {"field": "semanticComposition.expectedWorkspaceFill"},
                )
            expected_workspace_fill.append(item)

    if candidate.kind == "add_existing_plugin":
        if changed:
            if len(present) != 1 or absent:
                raise _HostResultInvalid(
                    "Host mutation result add expectations must contain exactly one present instance.",
                    {"field": "semanticComposition.expectedRuntime"},
                )
            instance_id = present[0]
            if candidate.effect.type == "workspace_region":
                if semantic.get("expectedGeometry") is not None or semantic.get("expectedPlacement") is not None:
                    raise _HostResultInvalid(
                        "Workspace Add must use an explicit Workspace fill expectation.",
                        {"field": "semanticComposition"},
                    )
                if expected_workspace_fill is None or not any(
                    item["instanceId"] == instance_id and item["region"] == candidate.effect.region
                    for item in expected_workspace_fill
                ):
                    raise _HostResultInvalid(
                        "Workspace Add must expect the selected Region.",
                        {"field": "semanticComposition.expectedWorkspaceFill"},
                    )
            elif semantic.get("expectedPlacement") is not None:
                if semantic.get("expectedGeometry") is not None:
                    raise _HostResultInvalid(
                        "Host mutation result Add cannot declare both placement and geometry.",
                        {"field": "semanticComposition"},
                    )
                expected_placement = _validate_expected_placement(
                    semantic.get("expectedPlacement"), instance_id=instance_id, required=True
                )
                if expected_placement["type"] != "plugin_slot":
                    raise _HostResultInvalid(
                        "Host mutation result Add expectedPlacement must target a Plugin Slot.",
                        {"field": "semanticComposition.expectedPlacement"},
                    )
            elif candidate.effect.type == "add_default":
                expected_geometry = _required_mapping(
                    semantic.get("expectedGeometry"),
                    "semanticComposition.expectedGeometry",
                )
                if expected_geometry.get("instanceId") != instance_id:
                    raise _HostResultInvalid(
                        "Host mutation result expectedGeometry targets the wrong instance.",
                        {
                            "field": "semanticComposition.expectedGeometry.instanceId",
                            "expected": instance_id,
                            "actual": expected_geometry.get("instanceId"),
                        },
                    )
        else:
            if absent or candidate.target.instanceId is not None and present != [
                candidate.target.instanceId
            ]:
                raise _HostResultInvalid(
                    "Host mutation result already-satisfied add expectations are inconsistent.",
                    {"field": "semanticComposition.expectedRuntime"},
                )
            instance_id = candidate.target.instanceId or (present[0] if present else None)
    elif candidate.kind == "remove_plugin":
        instance_id = candidate.target.instanceId
        if changed:
            if instance_id is None or absent != [instance_id] or present:
                raise _HostResultInvalid(
                    "Host mutation result remove expectations must contain exactly the selected absent instance.",
                    {"field": "semanticComposition.expectedRuntime"},
                )
        elif absent != ([] if instance_id is None else [instance_id]) or present:
            raise _HostResultInvalid(
                "Host mutation result already-satisfied remove expectations are inconsistent.",
                {"field": "semanticComposition.expectedRuntime"},
            )
    else:
        instance_id = candidate.target.instanceId
        if instance_id is None or present != [instance_id] or absent:
            raise _HostResultInvalid(
                "Host mutation result move expectations must contain exactly the selected present instance.",
                {"field": "semanticComposition.expectedRuntime"},
            )
        expected_placement = _validate_expected_placement(
            semantic.get("expectedPlacement"),
            instance_id=instance_id,
            required=candidate.effect.type not in {"row_edge", "workspace_region"},
        )

    return _HostExpectations(
        expected_runtime=normalized_runtime,
        expected_geometry=expected_geometry,
        expected_placement=expected_placement,
        expected_workspace_fill=expected_workspace_fill,
        instance_id=instance_id,
    )


class CreatorActionExecutionPlaybook:
    """Execute one exact Host-generated Creator Action by actionId."""

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
        candidate: CreatorActionCandidate,
        status: str,
        instance_id: str | None = None,
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
            operation=candidate.kind,
            status=status,  # type: ignore[arg-type]
            pluginId=candidate.target.pluginId,
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
    def _mutation_revision(mutation: Mapping[str, Any]) -> int | None:
        value = mutation.get("mutationRevision")
        return value if isinstance(value, int) and not isinstance(value, bool) else None

    def _mutation_failure(
        self,
        started_at: float,
        *,
        candidate: CreatorActionCandidate,
        error: Exception,
        mutation_attempts: int,
        snapshot_refreshes: int,
    ) -> CreatorOperationExecutionResult:
        state_changed = (
            error.state_changed
            if isinstance(error, AppUIModelMutationError)
            else False
        )
        return self._result(
            started_at,
            candidate=candidate,
            status="failed",
            instance_id=candidate.target.instanceId,
            mutation_changed=state_changed,
            error_code=getattr(error, "code", type(error).__name__),
            message=str(error),
            details=getattr(error, "details", None),
            mutation_attempts=mutation_attempts,
            snapshot_refreshes=snapshot_refreshes,
        )

    async def execute(
        self,
        snapshot: CreatorDomainSnapshot,
        candidate: CreatorActionCandidate,
    ) -> CreatorOperationExecutionResult:
        """Execute the selected action without rechecking its eligibility in Python."""

        started_at = monotonic()
        try:
            await self.verification.ensure_baseline()
        except Exception as error:
            return self._result(
                started_at,
                candidate=candidate,
                status="failed",
                instance_id=candidate.target.instanceId,
                error_code="PRODUCT_OPERATION_STATIC_BASELINE_FAILED",
                message=str(error),
            )

        current_snapshot = snapshot
        current_candidate = candidate
        mutation_attempts = 0
        snapshot_refreshes = 0
        while True:
            mutation_attempts += 1
            try:
                mutation_result = await self.mutation_service.mutate(
                    app_ui_model_hash=current_snapshot.app_ui_model_hash,
                    operations=[
                        {
                            "type": "execute_creator_action",
                            "actionId": candidate.actionId,
                        }
                    ],
                )
            except AppUIModelMutationError as error:
                if error.code not in _STALE_ACTION_ERROR_CODES or snapshot_refreshes >= 1:
                    return self._mutation_failure(
                        started_at,
                        candidate=current_candidate,
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
                        candidate=current_candidate,
                        status="failed",
                        instance_id=current_candidate.target.instanceId,
                        error_code="PRODUCT_OPERATION_SNAPSHOT_REFRESH_FAILED",
                        message=str(refresh_error),
                        details={
                            "causeCode": error.code,
                            "causeDetails": error.details,
                        },
                        mutation_attempts=mutation_attempts,
                        snapshot_refreshes=snapshot_refreshes,
                    )
                current_candidate = next(
                    (
                        item
                        for item in current_snapshot.action_catalog.candidates
                        if item.actionId == candidate.actionId
                    ),
                    None,
                )
                if current_candidate is None:
                    return self._result(
                        started_at,
                        candidate=candidate,
                        status="failed",
                        instance_id=candidate.target.instanceId,
                        error_code="PRODUCT_OPERATION_STALE",
                        message=(
                            "The selected Creator Action is no longer available "
                            "in the refreshed Action Catalog."
                        ),
                        details={
                            "actionId": candidate.actionId,
                            "causeCode": error.code,
                            "causeDetails": error.details,
                        },
                        mutation_attempts=mutation_attempts,
                        snapshot_refreshes=snapshot_refreshes,
                    )
                continue
            except Exception as error:
                return self._mutation_failure(
                    started_at,
                    candidate=current_candidate,
                    error=error,
                    mutation_attempts=mutation_attempts,
                    snapshot_refreshes=snapshot_refreshes,
                )

            mutation: Mapping[str, Any] | None = None
            try:
                raw_mutation = mutation_result.to_dict()
                mutation = _required_mapping(raw_mutation, "mutation")
                expectations = _validate_host_result(mutation, current_candidate)
            except _HostResultInvalid as error:
                return self._result(
                    started_at,
                    candidate=current_candidate,
                    status="failed",
                    instance_id=current_candidate.target.instanceId,
                    mutation_changed=(
                        mutation is not None and mutation.get("changed") is True
                    ),
                    mutation_revision=(
                        None
                        if mutation is None
                        else self._mutation_revision(mutation)
                    ),
                    error_code="PRODUCT_OPERATION_RESULT_INVALID",
                    message=str(error),
                    details=error.details,
                    mutation_attempts=mutation_attempts,
                    snapshot_refreshes=snapshot_refreshes,
                )
            except Exception as error:
                return self._result(
                    started_at,
                    candidate=current_candidate,
                    status="failed",
                    instance_id=current_candidate.target.instanceId,
                    error_code="PRODUCT_OPERATION_RESULT_INVALID",
                    message="The Host mutation result could not be read.",
                    details={"cause": str(error)},
                    mutation_attempts=mutation_attempts,
                    snapshot_refreshes=snapshot_refreshes,
                )

            mutation_revision = self._mutation_revision(mutation)
            if mutation.get("changed") is False:
                return self._result(
                    started_at,
                    candidate=current_candidate,
                    status="already_satisfied",
                    instance_id=expectations.instance_id,
                    mutation_changed=False,
                    mutation_revision=mutation_revision,
                    mutation_attempts=mutation_attempts,
                    snapshot_refreshes=snapshot_refreshes,
                )

            verification = await self.verification.verify(
                mutation_result=mutation,
                expected_runtime=expectations.expected_runtime,
                expected_geometry=expectations.expected_geometry,
                expected_placement=expectations.expected_placement,
                expected_workspace_fill=expectations.expected_workspace_fill,
            )
            if (
                verification.staticStatus == "passed"
                and (
                    verification.runtimeStatus == "passed"
                    or (
                        self.verification.verification_mode == "static_only"
                        and verification.runtimeStatus == "not-run"
                    )
                )
            ):
                status = "success"
            elif verification.runtimeStatus in {"stale", "unavailable"}:
                status = "committed_unverified"
            else:
                status = "failed"
            return self._result(
                started_at,
                candidate=current_candidate,
                status=status,
                instance_id=expectations.instance_id,
                mutation_changed=True,
                mutation_revision=mutation_revision,
                verification=verification,
                mutation_attempts=mutation_attempts,
                snapshot_refreshes=snapshot_refreshes,
            )
