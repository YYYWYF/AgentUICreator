from __future__ import annotations

from collections.abc import Mapping
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
from ..model_protocol.provider_trace import ProviderResponseTraceCollector
from ..model_settings import CreatorSelectorModelSettings
from ..project_control import ProjectControlClient, ProjectControlMetrics
from ..repair import CreatorRepairState
from ..runtime_diagnostics import (
    RuntimeDiagnosticInspectionService,
    RuntimeDiagnosticStore,
)
from ..streaming.runtime_events import (
    CreatorEventSink,
    CreatorStepFinished,
    CreatorStepStarted,
)
from ..validation import CreatorValidationService
from .action_playbook import CreatorActionExecutionPlaybook
from .models import (
    CreatorActionCandidate,
    CreatorActionSelection,
    CreatorOperationExecutionResult,
    CreatorOperationResolution,
    WorkspaceRegionActionEffect,
)
from .presentation import (
    CreatorIntentPresentation,
    CreatorIntentRoute,
    present_creator_action_selection,
)
from .selector import ACTION_SELECTOR_PROTOCOL, CreatorActionSelectionError, CreatorActionSelector
from .snapshot import CreatorDomainSnapshotMetrics, CreatorDomainSnapshotProvider
from .verification import CompositionOperationVerificationService


@dataclass(frozen=True, slots=True)
class ProductizedOperationToolMetrics:
    """AG-UI-facing metrics for a run that never enters DeepAgents."""

    modelCalls: int
    actionSelectorCalls: int = 0
    actionSelectorRepairCalls: int = 0
    actionSelectorInvalidResponses: int = 0
    actionSelectorDurationMs: int = 0
    actionSelectorCandidateCount: int = 0
    actionSelectorContextCharacters: int = 0
    totalModelCalls: int | None = None
    toolCalls: int = 0
    validToolCalls: int = 0
    invalidToolCalls: int = 0
    deepAgentCalls: int = 0
    # Kept only so persisted test fixtures and older callers can still be read.
    operationResolverCalls: int = 0
    operationResolverRepairCalls: int = 0
    operationResolverInvalidResponses: int = 0

    def to_dict(self) -> dict[str, int]:
        value = asdict(self)
        legacy = self.operationResolverCalls or self.operationResolverRepairCalls or self.operationResolverInvalidResponses
        value.pop("operationResolverCalls", None)
        value.pop("operationResolverRepairCalls", None)
        value.pop("operationResolverInvalidResponses", None)
        if self.totalModelCalls is None:
            value.pop("totalModelCalls", None)
        if legacy:
            value.update(
                {
                    "operationResolverCalls": self.operationResolverCalls,
                    "operationResolverRepairCalls": self.operationResolverRepairCalls,
                    "operationResolverInvalidResponses": self.operationResolverInvalidResponses,
                }
            )
        return value


@dataclass(frozen=True, slots=True)
class ProductizedOperationRun:
    """Result shape shared with the server's productized AG-UI projection."""

    text: str
    metrics: ProductizedOperationToolMetrics
    project_control: ProjectControlMetrics
    repeated_project_control_reads: int
    domain_observations: DomainObservationMetrics
    app_ui_model_mutations: AppUIModelMutationMetrics
    snapshot_metrics: CreatorDomainSnapshotMetrics
    operation_result: CreatorOperationExecutionResult | None
    validation_metrics: dict[str, object]
    completion: str
    selection: CreatorActionSelection | None = None
    selected_action: CreatorActionCandidate | None = None
    action_selector_metrics: dict[str, object] = field(default_factory=dict)
    intent_presentation: CreatorIntentPresentation | None = None
    blocker: dict[str, Any] | None = None
    # Legacy persisted result fields. New production runs leave these empty.
    operation_resolver_metrics: dict[str, int] = field(default_factory=dict)
    resolution: CreatorOperationResolution | None = None
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
    operation_name = {
        "add_existing_plugin": "add existing Plugin",
        "remove_plugin": "remove Plugin instance",
        "move_plugin": "move Plugin instance",
    }[operation.operation]
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
    """Route productized requests through the Host-generated Action Catalog."""

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
        selector_settings: CreatorSelectorModelSettings | None = None,
        raw_trace: bool = False,
        provider_trace_collector: ProviderResponseTraceCollector | None = None,
        telemetry: CreatorRunTelemetry | None = None,
        event_sink: CreatorEventSink | None = None,
    ) -> None:
        self.project_root = Path(project_root).resolve()
        self.activity = activity
        self.project_control = project_control
        self.event_sink = event_sink
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
        self.action_playbook = CreatorActionExecutionPlaybook(
            mutation_service=self.mutation_service,
            snapshot_provider=self.snapshot_provider,
            verification=verification,
        )
        self.selector = CreatorActionSelector(
            model=model,
            max_retries=max_retries,
            recovery_factory=recovery_factory,
            selector_settings=selector_settings,
            provider_trace_collector=provider_trace_collector if raw_trace else None,
            invalid_response_logger=(
                activity.logger.record if raw_trace and activity.logger is not None else None
            ),
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
        """Return a terminal productized result; only general_change returns None."""

        user_message = _latest_user_message(messages)
        await self._publish_step_started(
            "creator.grounding",
            {"phase": "grounding", "status": "running"},
        )
        try:
            snapshot = await self.snapshot_provider.build()
        except Exception as error:
            await self._publish_step_finished(
                "creator.grounding",
                {
                    "phase": "grounding",
                    "status": "failed",
                    "errorCode": _error_code(error),
                    "snapshotBuildMs": self.snapshot_provider.metrics.durationMs,
                    "snapshotFailures": self.snapshot_provider.metrics.failures,
                    "modelCalls": 0,
                },
            )
            raise
        await self._publish_step_finished(
            "creator.grounding",
            {
                "phase": "grounding",
                "status": "success",
                "snapshotBuildMs": self.snapshot_provider.metrics.durationMs,
                "snapshotBuilds": self.snapshot_provider.metrics.builds,
                "snapshotFailures": self.snapshot_provider.metrics.failures,
                "modelCalls": 0,
            },
        )
        self.observations.observe_composition_snapshot(
            hash=snapshot.app_ui_model_hash,
            revision=self.activity.revision,
            coverage=snapshot.observation_coverage,
        )

        await self._publish_step_started(
            "creator.resolve",
            {"phase": "understanding", "status": "running"},
        )
        try:
            selection = await self.selector.select(
                user_message,
                snapshot.action_selector_context,
            )
            selected_action = None
            if selection.decision == "select_action":
                assert selection.actionId is not None
                selected_action = next(
                    (
                        candidate
                        for candidate in snapshot.action_catalog.candidates
                        if candidate.actionId == selection.actionId
                    ),
                    None,
                )
                if selected_action is None:
                    raise CreatorActionSelectionError(
                        "The selected Action is missing from the source Action Catalog.",
                        {
                            "actionId": selection.actionId,
                            "catalogRevision": snapshot.action_catalog.revision,
                },
            )
        except Exception as error:
            if self.telemetry is not None:
                self.telemetry.bind(action_selector=self._action_selector_metrics())
            await self._publish_step_finished(
                "creator.resolve",
                {
                    "phase": "understanding",
                    "status": "failed",
                    "errorCode": _error_code(error),
                    **self._action_selector_metrics_metadata(),
                    **_action_selector_failure_metadata(error),
                },
            )
            raise

        route: CreatorIntentRoute = {
            "select_action": "productized",
            "needs_clarification": "clarification",
            "general_change": "general-agent",
            "unsupported_product_action": "unsupported",
        }[selection.decision]
        presentation = present_creator_action_selection(
            selection,
            selected_action,
            route=route,
        )
        await self._publish_step_finished(
            "creator.resolve",
            {
                "phase": "understanding",
                "status": "success",
                **presentation.to_dict(),
                **self._action_selector_step_metadata(),
            },
        )
        self._record_route(
            selection,
            selected_action=selected_action,
            route=route,
            presentation=presentation,
        )

        selector_metrics = self.selector.metrics
        if selection.decision == "general_change":
            return None

        if selection.decision == "needs_clarification":
            clarification_question = selection.clarificationQuestion
            assert clarification_question is not None
            return self._terminal_run(
                text=clarification_question,
                selection=selection,
                selected_action=None,
                presentation=presentation,
                completion="success",
            )

        if selection.decision == "unsupported_product_action":
            return self._terminal_run(
                text="当前这个修改还没有可安全执行的操作。",
                selection=selection,
                selected_action=None,
                presentation=presentation,
                completion="blocked",
                blocker={
                    "code": "PRODUCT_ACTION_UNSUPPORTED",
                    "message": "当前请求没有可安全执行的产品化操作。",
                },
            )

        assert selected_action is not None
        await self._publish_step_started(
            "creator.productized-operation",
            {
                "phase": "execution",
                "status": "running",
                "operation": selected_action.kind,
            },
        )
        try:
            operation_result = await self.action_playbook.execute(
                snapshot,
                selected_action,
            )
        except Exception as error:
            await self._publish_step_finished(
                "creator.productized-operation",
                {
                    "phase": "execution",
                    "status": "failed",
                    "operation": selected_action.kind,
                    "errorCode": _error_code(error),
                    "executionModelCalls": 0,
                    "toolCalls": 0,
                    "deepAgentCalls": 0,
                },
            )
            raise
        await self._publish_step_finished(
            "creator.productized-operation",
            self._operation_step_metadata(operation_result),
        )
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

        return ProductizedOperationRun(
            text=_operation_text(operation_result),
            metrics=ProductizedOperationToolMetrics(
                modelCalls=selector_metrics.modelCalls,
                actionSelectorCalls=selector_metrics.modelCalls,
                actionSelectorRepairCalls=selector_metrics.repairCalls,
                actionSelectorInvalidResponses=selector_metrics.invalidResponses,
                actionSelectorDurationMs=selector_metrics.durationMs,
                actionSelectorCandidateCount=selector_metrics.candidateCount,
                actionSelectorContextCharacters=selector_metrics.contextCharacters,
                totalModelCalls=selector_metrics.modelCalls,
            ),
            project_control=self.project_control.metrics,
            repeated_project_control_reads=0,
            domain_observations=self.observations.metrics,
            app_ui_model_mutations=self.mutation_service.metrics,
            snapshot_metrics=self.snapshot_provider.metrics,
            operation_result=operation_result,
            validation_metrics=self.validation.metrics(),
            completion=(
                operation_result.status
                if operation_result.status
                in {"success", "already_satisfied", "committed_unverified"}
                else "failed"
            ),
            selection=selection,
            selected_action=selected_action,
            action_selector_metrics=self._action_selector_metrics(),
            intent_presentation=presentation,
            composition_fast_path_metrics=self.observations.composition_fast_path_metrics,
        )

    def _terminal_run(
        self,
        *,
        text: str,
        selection: CreatorActionSelection,
        selected_action: CreatorActionCandidate | None,
        presentation: CreatorIntentPresentation,
        completion: str,
        blocker: dict[str, Any] | None = None,
    ) -> ProductizedOperationRun:
        metrics = self.selector.metrics
        return ProductizedOperationRun(
            text=text,
            metrics=ProductizedOperationToolMetrics(
                modelCalls=metrics.modelCalls,
                actionSelectorCalls=metrics.modelCalls,
                actionSelectorRepairCalls=metrics.repairCalls,
                actionSelectorInvalidResponses=metrics.invalidResponses,
                actionSelectorDurationMs=metrics.durationMs,
                actionSelectorCandidateCount=metrics.candidateCount,
                actionSelectorContextCharacters=metrics.contextCharacters,
                totalModelCalls=metrics.modelCalls,
            ),
            project_control=self.project_control.metrics,
            repeated_project_control_reads=0,
            domain_observations=self.observations.metrics,
            app_ui_model_mutations=self.mutation_service.metrics,
            snapshot_metrics=self.snapshot_provider.metrics,
            operation_result=None,
            validation_metrics=self.validation.metrics(),
            completion=completion,
            selection=selection,
            selected_action=selected_action,
            action_selector_metrics=self._action_selector_metrics(),
            intent_presentation=presentation,
            blocker=blocker,
            composition_fast_path_metrics=self.observations.composition_fast_path_metrics,
        )

    async def _publish_step_started(
        self,
        name: str,
        metadata: dict[str, object],
    ) -> None:
        event_sink = getattr(self, "event_sink", None)
        if event_sink is not None:
            await event_sink.publish(
                CreatorStepStarted(name=name, metadata={"creator": metadata})
            )

    async def _publish_step_finished(
        self,
        name: str,
        metadata: dict[str, object],
    ) -> None:
        event_sink = getattr(self, "event_sink", None)
        if event_sink is not None:
            await event_sink.publish(
                CreatorStepFinished(name=name, metadata={"creator": metadata})
            )

    def _action_selector_metrics(self) -> dict[str, object]:
        metrics = self.selector.metrics
        result: dict[str, object] = {
            "actionSelectorProtocol": ACTION_SELECTOR_PROTOCOL,
            "actionSelectorModel": self.selector.requested_model,
            "actionSelectorRequestedMaxTokens": self.selector.selector_settings.max_tokens,
            "actionSelectorRequestedReasoningEffort": self.selector.selector_settings.reasoning_effort,
            "actionSelectorCalls": metrics.modelCalls,
            "actionSelectorRepairCalls": metrics.repairCalls,
            "actionSelectorInvalidResponses": metrics.invalidResponses,
            "actionSelectorDurationMs": metrics.durationMs,
            "actionSelectorCandidateCount": metrics.candidateCount,
            "actionSelectorContextCharacters": metrics.contextCharacters,
        }
        if metrics.repairReasonCode is not None:
            result["actionSelectorRepairReasonCode"] = metrics.repairReasonCode
        if metrics.repairReason is not None:
            result["actionSelectorRepairReason"] = metrics.repairReason
        for key, value in {
            "actionSelectorResolvedModel": metrics.resolvedModel,
            "actionSelectorFinishReason": metrics.finishReason,
            "actionSelectorPromptTokens": metrics.promptTokens,
            "actionSelectorCompletionTokens": metrics.completionTokens,
            "actionSelectorTotalTokens": metrics.totalTokens,
            "actionSelectorReasoningTokens": metrics.reasoningTokens,
        }.items():
            if value is not None:
                result[key] = value
        return result

    def _action_selector_metrics_metadata(self) -> dict[str, object]:
        metrics = self.selector.metrics
        return {
            "actionSelectorProtocol": ACTION_SELECTOR_PROTOCOL,
            "modelCalls": metrics.modelCalls,
            "repairCalls": metrics.repairCalls,
            "invalidResponses": metrics.invalidResponses,
            "durationMs": metrics.durationMs,
            "candidateCount": metrics.candidateCount,
            "contextCharacters": metrics.contextCharacters,
        }

    def _action_selector_step_metadata(self) -> dict[str, object]:
        return {
            **self._action_selector_metrics_metadata(),
            **self._action_selector_metrics(),
        }

    @staticmethod
    def _selected_action_metadata(
        action: CreatorActionCandidate | None,
    ) -> dict[str, object]:
        if action is None:
            return {}
        metadata: dict[str, object] = {
            "actionId": action.actionId,
            "actionKind": action.kind,
            "actionStatus": action.status,
            "effectType": action.effect.type,
            "targetPluginIds": [action.target.pluginId],
            "targetInstanceIds": (
                [action.target.instanceId]
                if action.target.instanceId is not None
                else []
            ),
        }
        if isinstance(action.effect, WorkspaceRegionActionEffect):
            metadata["region"] = action.effect.region
        return metadata

    @staticmethod
    def _operation_step_metadata(
        operation: CreatorOperationExecutionResult,
    ) -> dict[str, object]:
        verification = operation.verification
        metrics = operation.metrics
        return {
            "phase": "execution",
            "status": operation.status,
            "operation": operation.operation,
            "executionModelCalls": metrics.executionModelCalls,
            "toolCalls": 0,
            "deepAgentCalls": 0,
            "mutationAttempts": metrics.mutationAttempts,
            "snapshotRefreshes": metrics.snapshotRefreshes,
            "staticStatus": (
                verification.staticStatus if verification is not None else "not-run"
            ),
            "runtimeStatus": (
                verification.runtimeStatus if verification is not None else "not-run"
            ),
            "runtimeFreshnessAttempts": (
                verification.runtimeFreshnessAttempts
                if verification is not None
                else metrics.verificationRuntimeFreshnessAttempts
            ),
            "runtimeFreshnessWaitMs": (
                verification.runtimeFreshnessWaitMs if verification is not None else 0
            ),
            "placementVerified": (
                verification.placementVerified if verification is not None else None
            ),
            "geometryVerified": (
                verification.geometryVerified if verification is not None else None
            ),
            "workspaceFillVerified": (
                verification.workspaceFillVerified if verification is not None else None
            ),
        }

    def _record_route(
        self,
        selection: CreatorActionSelection,
        *,
        selected_action: CreatorActionCandidate | None,
        route: CreatorIntentRoute,
        presentation: CreatorIntentPresentation | None = None,
    ) -> None:
        route_value = {
            "decision": selection.decision,
            "route": route,
            "productized": route == "productized",
            "generalAgent": route == "general-agent",
            "clarification": route == "clarification",
            "unsupported": route == "unsupported",
            **self._selected_action_metadata(selected_action),
        }
        if self.activity.logger is None:
            pass
        else:
            self.activity.logger.record("productized_operation_route", route_value)
        if self.telemetry is not None:
            self.telemetry.bind(
                action_selector=self._action_selector_metrics(),
                action_selection=selection.model_dump(mode="json"),
                selected_creator_action=(
                    selected_action.model_dump(mode="json")
                    if selected_action is not None
                    else None
                ),
                operation_route=route_value,
                operation_presentation=(
                    presentation.to_dict() if presentation is not None else None
                ),
            )


def _error_code(error: BaseException) -> str:
    code = getattr(error, "code", None)
    if isinstance(code, str) and code:
        return code
    return type(error).__name__


def _action_selector_failure_metadata(error: BaseException) -> dict[str, str]:
    if not isinstance(error, CreatorActionSelectionError):
        return {}
    details = error.details
    if not isinstance(details, Mapping):
        return {}
    reason_code = details.get("reasonCode")
    reason = details.get("reason")
    if (
        not isinstance(reason_code, str)
        or len(reason_code) > 64
        or not isinstance(reason, str)
        or len(reason) > 500
    ):
        return {}
    return {
        "selectorFailureReasonCode": reason_code,
        "selectorFailureReason": reason,
    }
