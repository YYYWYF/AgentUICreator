from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable

from ..activity import CreatorActivityRecorder
from ..app_ui_model import (
    AppUIModelMutationMetrics,
    AppUIModelMutationService,
    ProjectMutationCoordinator,
)
from ..domain_state import DomainObservationContext, DomainObservationMetrics
from ..observability import CreatorRunTelemetry
from ..project_control import ProjectControlClient, ProjectControlMetrics
from ..repair import CreatorRepairState
from ..runtime_diagnostics import (
    RuntimeDiagnosticInspectionService,
    RuntimeDiagnosticStore,
)
from ..validation import CreatorValidationService
from .models import CreatorOperationExecutionResult, CreatorOperationResolution
from .playbooks import AddExistingPluginPlaybook, RemovePluginPlaybook
from .registry import CreatorOperationRegistry
from .resolver import CreatorOperationResolver
from .snapshot import CreatorDomainSnapshotMetrics, CreatorDomainSnapshotProvider
from .verification import CompositionOperationVerificationService


@dataclass(frozen=True, slots=True)
class ProductizedOperationToolMetrics:
    """AG-UI-facing metrics for a run that never enters DeepAgents."""

    modelCalls: int
    operationResolverCalls: int
    operationResolverRepairCalls: int
    operationResolverInvalidResponses: int
    toolCalls: int = 0
    validToolCalls: int = 0
    invalidToolCalls: int = 0
    deepAgentCalls: int = 0

    def to_dict(self) -> dict[str, int]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class ProductizedOperationRun:
    """Result shape shared with the server's productized AG-UI projection."""

    text: str
    metrics: ProductizedOperationToolMetrics
    project_control: ProjectControlMetrics
    repeated_project_control_reads: int
    domain_observations: DomainObservationMetrics
    app_ui_model_mutations: AppUIModelMutationMetrics
    operation_resolver_metrics: dict[str, int]
    snapshot_metrics: CreatorDomainSnapshotMetrics
    resolution: CreatorOperationResolution
    operation_result: CreatorOperationExecutionResult | None
    validation_metrics: dict[str, object]
    completion: str
    blocker: dict[str, Any] | None = None
    terminal_metrics: dict[str, object] = field(
        default_factory=lambda: {
            "deepAgentCalls": 0,
            "modelCallsAfterTerminalBlocker": 0,
        }
    )
    change_layer_metrics: dict[str, object] = field(default_factory=dict)
    composition_fast_path_metrics: Any = None


def _latest_user_message(messages: list[dict[str, str]]) -> str:
    for message in reversed(messages):
        if message.get("role") == "user" and isinstance(message.get("content"), str):
            content = message["content"].strip()
            if content:
                return content
    raise ValueError("A Productized Operation requires a non-empty user message.")


def _operation_text(
    operation: CreatorOperationExecutionResult,
) -> str:
    operation_name = (
        "add existing Plugin"
        if operation.operation == "add_existing_plugin"
        else "remove Plugin instance"
    )
    if operation.status == "success":
        return f"Completed Productized operation: {operation_name}."
    if operation.status == "already_satisfied":
        return f"Already satisfied: {operation_name}."
    if operation.status == "committed_unverified":
        return (
            f"Committed Productized operation, but runtime verification is not yet fresh: "
            f"{operation_name}."
        )
    detail = operation.message or operation.errorCode or "the Host rejected the operation"
    return f"Productized operation was not completed: {detail}"


class ProductizedOperationEngine:
    """Resolve every domain-write request and execute only registered Add/Remove playbooks."""

    def __init__(
        self,
        *,
        model: Any,
        project_root: str | Path,
        activity: CreatorActivityRecorder,
        project_control: ProjectControlClient,
        mutation_coordinator: ProjectMutationCoordinator,
        diagnostics: RuntimeDiagnosticStore,
        thread_id: str,
        max_retries: int,
        recovery_factory: Callable[[], Any] | None = None,
        telemetry: CreatorRunTelemetry | None = None,
    ) -> None:
        self.project_root = Path(project_root).resolve()
        self.activity = activity
        self.project_control = project_control
        self.observations = DomainObservationContext()
        self.repair_state = CreatorRepairState()
        self.snapshot_provider = CreatorDomainSnapshotProvider(project_control)
        self.mutation_service = AppUIModelMutationService(
            project_root=self.project_root,
            project_control=project_control,
            activity=activity,
            mutation_coordinator=mutation_coordinator,
            runtime_diagnostics=diagnostics,
            thread_id=thread_id,
        )
        self.validation = CreatorValidationService(
            project_root=self.project_root,
            activity=activity,
            repair_state=self.repair_state,
        )
        self.runtime_inspection = RuntimeDiagnosticInspectionService(
            store=diagnostics,
            thread_id=thread_id,
            project_control=project_control,
            observations=self.observations,
            activity=activity,
            repair_state=self.repair_state,
        )
        verification = CompositionOperationVerificationService(
            validation=self.validation,
            runtime=self.runtime_inspection,
        )
        self.registry = CreatorOperationRegistry(
            {
                "add_existing_plugin": AddExistingPluginPlaybook(
                    mutation_service=self.mutation_service,
                    snapshot_provider=self.snapshot_provider,
                    verification=verification,
                ),
                "remove_plugin": RemovePluginPlaybook(
                    mutation_service=self.mutation_service,
                    snapshot_provider=self.snapshot_provider,
                    verification=verification,
                ),
            }
        )
        self.resolver = CreatorOperationResolver(
            model=model,
            max_retries=max_retries,
            recovery_factory=recovery_factory,
        )
        self.telemetry = telemetry
        if telemetry is not None:
            telemetry.bind(
                activity=activity,
                project_control=project_control.metrics,
                mutation=self.mutation_service.metrics,
                validation=self.validation,
            )

    async def run(
        self, messages: list[dict[str, str]]
    ) -> ProductizedOperationRun | None:
        """Return a productized result; None enters the existing General Agent."""

        user_message = _latest_user_message(messages)
        snapshot = await self.snapshot_provider.build()
        self.observations.observe_composition_snapshot(
            hash=snapshot.app_ui_model_hash,
            revision=self.activity.revision,
            coverage=snapshot.observation_coverage,
        )
        resolution = await self.resolver.resolve(
            user_message,
            snapshot.plugin_index,
        )
        if resolution.kind == "needs_clarification":
            self._record_route(resolution, productized=False, fallback=False)
            resolver_metrics = self.resolver.metrics
            clarification_question = resolution.clarificationQuestion
            assert clarification_question is not None
            return ProductizedOperationRun(
                text=clarification_question,
                metrics=ProductizedOperationToolMetrics(
                    modelCalls=resolver_metrics.modelCalls,
                    operationResolverCalls=resolver_metrics.modelCalls,
                    operationResolverRepairCalls=resolver_metrics.repairCalls,
                    operationResolverInvalidResponses=resolver_metrics.invalidResponses,
                ),
                project_control=self.project_control.metrics,
                repeated_project_control_reads=0,
                domain_observations=self.observations.metrics,
                app_ui_model_mutations=self.mutation_service.metrics,
                operation_resolver_metrics=resolver_metrics.to_dict(),
                snapshot_metrics=self.snapshot_provider.metrics,
                resolution=resolution,
                operation_result=None,
                validation_metrics=self.validation.metrics(),
                completion="success",
                composition_fast_path_metrics=self.observations.composition_fast_path_metrics,
            )
        playbook = self.registry.get(resolution.kind)
        if playbook is None:
            self._record_route(resolution, productized=False)
            return None

        self._record_route(resolution, productized=True)
        operation_result = await playbook.execute(snapshot, resolution)
        if operation_result.status == "already_satisfied":
            self.activity.record_semantic_noop(
                source="productized_operation",
                reason="already-satisfied",
            )
        if self.activity.logger is not None:
            self.activity.logger.record(
                "productized_operation_finished",
                {
                    "operation": operation_result.operation,
                    "status": operation_result.status,
                    "errorCode": operation_result.errorCode,
                    "metrics": operation_result.metrics.model_dump(mode="json"),
                },
            )

        resolver_metrics = self.resolver.metrics
        return ProductizedOperationRun(
            text=_operation_text(operation_result),
            metrics=ProductizedOperationToolMetrics(
                modelCalls=resolver_metrics.modelCalls,
                operationResolverCalls=resolver_metrics.modelCalls,
                operationResolverRepairCalls=resolver_metrics.repairCalls,
                operationResolverInvalidResponses=resolver_metrics.invalidResponses,
            ),
            project_control=self.project_control.metrics,
            repeated_project_control_reads=0,
            domain_observations=self.observations.metrics,
            app_ui_model_mutations=self.mutation_service.metrics,
            operation_resolver_metrics=resolver_metrics.to_dict(),
            snapshot_metrics=self.snapshot_provider.metrics,
            resolution=resolution,
            operation_result=operation_result,
            validation_metrics=self.validation.metrics(),
            completion=(
                operation_result.status
                if operation_result.status
                in {"success", "already_satisfied", "committed_unverified"}
                else "failed"
            ),
            composition_fast_path_metrics=self.observations.composition_fast_path_metrics,
        )

    def _record_route(
        self,
        resolution: CreatorOperationResolution,
        *,
        productized: bool,
        fallback: bool | None = None,
    ) -> None:
        route_fallback = not productized if fallback is None else fallback
        if self.activity.logger is None:
            route = None
        else:
            route = {
                "kind": resolution.kind,
                "targetPluginCount": len(resolution.targetPluginIds),
                "targetInstanceCount": len(resolution.targetInstanceIds),
                "productized": productized,
                "fallback": route_fallback,
            }
            self.activity.logger.record("productized_operation_route", route)
        if self.telemetry is not None:
            self.telemetry.bind(
                operation_resolver=self.resolver.metrics.to_dict(),
                operation_route=route
                or {
                    "kind": resolution.kind,
                    "targetPluginCount": len(resolution.targetPluginIds),
                    "targetInstanceCount": len(resolution.targetInstanceIds),
                    "productized": productized,
                    "fallback": route_fallback,
                },
            )
