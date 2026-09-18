from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Literal

import httpx
import openai
from deepagents import create_deep_agent
from deepagents.middleware.filesystem import FilesystemMiddleware
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.errors import GraphRecursionError

from ..activity import CreatorActivityRecorder
from ..app_ui_model import (
    AppUIModelMutationMetrics,
    AppUIModelMutationService,
    ProjectMutationCoordinator,
)
from ..app_ui_model.mutation_tool import create_app_ui_model_mutation_tool
from ..domain_tools import create_project_control_tools
from ..domain_state import (
    CompositionFastPathMetrics,
    DomainObservationContext,
    DomainObservationMetrics,
)
from ..minimal_agent.agent import (
    _NoSummaryMiddleware,
    _message_text,
    _register_minimal_harness_profile,
)
from ..minimal_agent.path_policy import MinimalAgentPathPolicy, PolicyFilesystemBackend
from ..minimal_agent.runtime_guard import MinimalAgentRuntimeGuard, ToolActivity
from ..minimal_agent.tool_policy import ALLOWED_MINIMAL_TOOLS
from ..model_protocol.errors import AgentNoProgressError, ModelTimeoutError
from ..model_protocol.provider_trace import ProviderResponseTraceCollector
from ..model_protocol.reliability import create_creator_model_retry_middleware
from ..model_protocol.tool_protocol_guard import ToolProtocolMiddleware
from ..model_protocol.trace import ToolProtocolMetrics
from ..model_settings import DEFAULT_CREATOR_MODEL_MAX_RETRIES
from ..observability import CreatorRunTelemetry
from ..project_control import ProjectControlClient, ProjectControlMetrics
from ..repair import CreatorRepairState
from ..run_control import (
    CompletionStatus,
    CreatorRunControlState,
    TerminalBlockerStop,
)
from ..runtime_diagnostics import (
    RuntimeDiagnosticInspectionService,
    RuntimeDiagnosticStore,
    create_runtime_diagnostic_tool,
    create_runtime_layout_tool,
)
from ..service_contracts import (
    ServiceContractAuthorizationService,
    ServiceContractAuthorizationStore,
    ServiceContractAuthorizationVerifier,
    UIServiceContractCreationService,
    UIServiceContractMutationService,
    create_service_contract_tools,
)
from ..source_tools import (
    UIPluginCreationService,
    UIPluginSourceMutationService,
    UISourceCreationService,
    create_ui_plugin_tool,
    mutate_ui_plugin_source_tool,
)
from ..streaming.deepagent_v3_runner import DeepAgentV3Runner
from ..streaming.runtime_events import CreatorEventSink
from ..validation import (
    CreatorValidationService,
    ValidationCommandRunner,
    create_validation_tool,
)
from .completion_gate import CreatorDevelopmentCompletionGate
from .composition_verification_tail import CompositionVerificationTail
from .grounding_convergence import CompositionGroundingConvergenceMiddleware
from .change_scope import (
    ScopeAwareRecoveryGuard,
    build_change_layer_run_metrics,
)
from .prompt import DOMAIN_READ_AGENT_PROMPT, DOMAIN_WRITE_AGENT_PROMPT
from .runtime_guard import RepeatedProjectControlReadGuard
from .skills import create_domain_skills_backend, default_creator_skills_root
from .tool_batch_policy import DomainToolBatchPolicyMiddleware
from .tool_policy import DomainReadToolPolicyMiddleware, DomainWriteToolPolicyMiddleware


@dataclass(frozen=True, slots=True)
class DomainReadAgentResult:
    text: str
    metrics: ToolProtocolMetrics
    project_control: ProjectControlMetrics
    repeated_project_control_reads: int
    activities: tuple[ToolActivity, ...]
    domain_observations: DomainObservationMetrics
    completion: CompletionStatus
    blocker: dict[str, Any] | None
    terminal_metrics: dict[str, Any]


@dataclass(frozen=True, slots=True)
class DomainWriteAgentResult(DomainReadAgentResult):
    app_ui_model_mutations: AppUIModelMutationMetrics
    change_layer_metrics: dict[str, object]
    composition_fast_path_metrics: CompositionFastPathMetrics


class CreatorDomainReadAgent:
    def __init__(
        self,
        *,
        graph: Any,
        protocol: ToolProtocolMiddleware,
        runtime: MinimalAgentRuntimeGuard,
        repeated_read_guard: RepeatedProjectControlReadGuard,
        project_control: ProjectControlClient,
        observations: DomainObservationContext,
        mutation_service: AppUIModelMutationService | None = None,
        completion_gate: CreatorDevelopmentCompletionGate | None = None,
        completion_verification_tail: CompositionVerificationTail | None = None,
        automatic_completion_repair: bool = False,
        service_contract_authorizations: ServiceContractAuthorizationStore | None = None,
        scope_guard: ScopeAwareRecoveryGuard | None = None,
        run_control: CreatorRunControlState | None = None,
    ) -> None:
        self.graph = graph
        self.protocol = protocol
        self.runtime = runtime
        self.repeated_read_guard = repeated_read_guard
        self.project_control = project_control
        self.observations = observations
        self.mutation_service = mutation_service
        self.completion_gate = completion_gate
        self.completion_verification_tail = completion_verification_tail
        self.automatic_completion_repair = automatic_completion_repair
        self.activity = runtime.backend.activity
        self.service_contract_authorizations = service_contract_authorizations
        self.scope_guard = scope_guard
        self.run_control = run_control or CreatorRunControlState()

    async def run(self, prompt: str) -> DomainReadAgentResult:
        return await self.run_messages([{"role": "user", "content": prompt}])

    async def run_messages(
        self, messages: list[dict[str, str]]
    ) -> DomainReadAgentResult:
        if self.service_contract_authorizations is not None:
            current_user_message = next(
                (
                    message["content"]
                    for message in reversed(messages)
                    if message.get("role") == "user"
                ),
                "",
            )
            self.service_contract_authorizations.set_current_user_context(
                current_user_message=current_user_message,
                run_id=self.activity.run_id,
            )
        async def invoke(input_messages: list[Any]) -> Any:
            return await DeepAgentV3Runner().run(
                graph=self.graph,
                input={"messages": input_messages},
                config={"recursion_limit": 60},
                event_sink=self.runtime.event_sink,
            )

        completion_decision = None
        state: Any = None
        terminal_blocked = False
        try:
            state = await invoke(messages)
            await self._run_composition_verification_tail()
            for _attempt in range(3):
                if (
                    self.completion_gate is None
                    or not self.automatic_completion_repair
                ):
                    break
                state_messages = (
                    state.get("messages", []) if isinstance(state, dict) else []
                )
                final = next(
                    (
                        message
                        for message in reversed(state_messages)
                        if isinstance(message, AIMessage)
                    ),
                    None,
                )
                candidate = "" if final is None else _message_text(final).strip()
                completion_decision = self.completion_gate.review(candidate)
                if completion_decision.accepted or completion_decision.feedback is None:
                    break
                if self.run_control.blocked:
                    terminal_blocked = True
                    break
                state = await invoke(
                    [
                        *state_messages,
                        HumanMessage(content=completion_decision.feedback),
                    ]
                )
                await self._run_composition_verification_tail()
        except TerminalBlockerStop:
            terminal_blocked = True
        except GraphRecursionError as error:
            self.protocol.metrics.repeatedToolLoops += int(self.runtime.no_progress)
            raise AgentNoProgressError(
                "Domain-read agent exceeded its recursion limit."
            ) from error
        except AgentNoProgressError:
            self.protocol.metrics.repeatedToolLoops += 1
            raise
        except (httpx.TimeoutException, openai.APITimeoutError, TimeoutError) as error:
            raise ModelTimeoutError("Creator model request timed out.") from error
        if terminal_blocked or self.run_control.blocked:
            return self._build_result(
                text=self.run_control.render_blocker_response(),
                completion="blocked",
            )

        self.runtime.raise_terminal_error()
        await self._run_composition_verification_tail()
        messages = state.get("messages", []) if isinstance(state, dict) else []
        final = next(
            (message for message in reversed(messages) if isinstance(message, AIMessage)),
            None,
        )
        result_type = (
            DomainWriteAgentResult
            if self.mutation_service is not None
            else DomainReadAgentResult
        )
        text = "" if final is None else _message_text(final).strip()
        if self.completion_gate is not None:
            if completion_decision is None or not completion_decision.accepted:
                completion_decision = self.completion_gate.review(text)
            text = completion_decision.text
        completion: CompletionStatus = (
            "already_satisfied"
            if self.activity.semantic_noop_satisfied
            else "success"
        )
        values = dict(
            text=text,
            metrics=self.protocol.metrics,
            project_control=self.project_control.metrics,
            repeated_project_control_reads=self.repeated_read_guard.repeated_reads,
            activities=tuple(self.runtime.activities),
            domain_observations=self.observations.metrics,
            completion=completion,
            blocker=self.run_control.blocker_dict(),
            terminal_metrics=self.run_control.metrics(),
        )
        if self.mutation_service is not None:
            values["app_ui_model_mutations"] = self.mutation_service.metrics
            values["change_layer_metrics"] = build_change_layer_run_metrics(
                scope=(
                    self.scope_guard.metrics
                    if self.scope_guard is not None
                    else ScopeAwareRecoveryGuard().metrics
                ),
                activity=self.activity,
                protocol=self.protocol.metrics,
                project_control=self.project_control.metrics,
                mutation=self.mutation_service.metrics,
                run_control=self.run_control,
            )
            values["composition_fast_path_metrics"] = (
                self.observations.composition_fast_path_metrics
            )
        return result_type(**values)

    async def _run_composition_verification_tail(self) -> None:
        if (
            self.completion_verification_tail is None
            or self.mutation_service is None
        ):
            return
        await self.completion_verification_tail.run_if_needed(
            self.mutation_service
        )

    def _build_result(
        self,
        *,
        text: str,
        completion: CompletionStatus,
    ) -> DomainReadAgentResult:
        values: dict[str, Any] = {
            "text": text,
            "metrics": self.protocol.metrics,
            "project_control": self.project_control.metrics,
            "repeated_project_control_reads": self.repeated_read_guard.repeated_reads,
            "activities": tuple(self.runtime.activities),
            "domain_observations": self.observations.metrics,
            "completion": completion,
            "blocker": self.run_control.blocker_dict(),
            "terminal_metrics": self.run_control.metrics(),
        }
        if self.mutation_service is not None:
            values["app_ui_model_mutations"] = self.mutation_service.metrics
            values["change_layer_metrics"] = build_change_layer_run_metrics(
                scope=(
                    self.scope_guard.metrics
                    if self.scope_guard is not None
                    else ScopeAwareRecoveryGuard().metrics
                ),
                activity=self.activity,
                protocol=self.protocol.metrics,
                project_control=self.project_control.metrics,
                mutation=self.mutation_service.metrics,
                run_control=self.run_control,
            )
            values["composition_fast_path_metrics"] = (
                self.observations.composition_fast_path_metrics
            )
        result_type = (
            DomainWriteAgentResult
            if self.mutation_service is not None
            else DomainReadAgentResult
        )
        return result_type(**values)


def create_domain_read_creator_agent(
    *,
    model: BaseChatModel,
    workspace: str | Path,
    mode: Literal["development", "conformance"] = "development",
    raw_trace: bool = False,
    provider_trace_collector: ProviderResponseTraceCollector | None = None,
    project_control: ProjectControlClient | None = None,
    activity: CreatorActivityRecorder | None = None,
    event_sink: CreatorEventSink | None = None,
    telemetry: CreatorRunTelemetry | None = None,
    diagnostics: RuntimeDiagnosticStore | None = None,
    thread_id: str | None = None,
    max_retries: int = DEFAULT_CREATOR_MODEL_MAX_RETRIES,
    recovery_factory: Callable[[], BaseChatModel] | None = None,
) -> CreatorDomainReadAgent:
    _register_minimal_harness_profile(model)
    policy = (
        MinimalAgentPathPolicy.development()
        if mode == "development"
        else MinimalAgentPathPolicy.conformance()
    )
    backend = PolicyFilesystemBackend(workspace, policy, activity=activity)
    client = project_control or ProjectControlClient(project_root=Path(workspace))
    observations = DomainObservationContext()
    runtime_inspection = RuntimeDiagnosticInspectionService(
        store=diagnostics or RuntimeDiagnosticStore(),
        thread_id=thread_id,
        project_control=client,
        observations=observations,
        activity=backend.activity,
    )
    domain_tools = create_project_control_tools(
        client,
        observations=observations,
        activity=backend.activity,
    )
    domain_tools = (*domain_tools, create_runtime_layout_tool(runtime_inspection))
    metrics = ToolProtocolMetrics()
    run_control = CreatorRunControlState()
    protocol = ToolProtocolMiddleware(
        metrics=metrics,
        raw_trace=raw_trace,
        provider_trace_collector=provider_trace_collector,
        run_control=run_control,
    )
    if telemetry is not None:
        telemetry.bind(
            activity=backend.activity,
            protocol=metrics,
            project_control=client.metrics,
            run_control=run_control,
        )
    model_retry = create_creator_model_retry_middleware(
        metrics=metrics,
        max_retries=max_retries,
        logger=backend.activity.logger,
        recovery_factory=recovery_factory,
    )
    runtime = MinimalAgentRuntimeGuard(
        backend,
        event_sink=event_sink,
        run_control=run_control,
    )
    repeated_read_guard = RepeatedProjectControlReadGuard(
        backend,
        run_control=run_control,
    )
    filesystem = FilesystemMiddleware(
        backend=backend,
        tools=list(ALLOWED_MINIMAL_TOOLS),
        tool_token_limit_before_evict=None,
        human_message_token_limit_before_evict=None,
    )
    graph = create_deep_agent(
        model=model,
        tools=list(domain_tools),
        system_prompt=DOMAIN_READ_AGENT_PROMPT,
        backend=backend,
        subagents=[],
        skills=None,
        memory=None,
        middleware=[
            filesystem,
            DomainReadToolPolicyMiddleware(),
            repeated_read_guard,
            runtime,
            model_retry,
            protocol,
            _NoSummaryMiddleware(),
        ],
        name="creator-python-domain-read-agent",
    )
    return CreatorDomainReadAgent(
        graph=graph,
        protocol=protocol,
        runtime=runtime,
        repeated_read_guard=repeated_read_guard,
        project_control=client,
        observations=observations,
        run_control=run_control,
    )


class CreatorDomainWriteAgent(CreatorDomainReadAgent):
    pass


def create_domain_write_creator_agent(
    *,
    model: BaseChatModel,
    workspace: str | Path,
    mode: Literal["development", "conformance"] = "development",
    raw_trace: bool = False,
    provider_trace_collector: ProviderResponseTraceCollector | None = None,
    project_control: ProjectControlClient | None = None,
    activity: CreatorActivityRecorder | None = None,
    mutation_coordinator: ProjectMutationCoordinator | None = None,
    event_sink: CreatorEventSink | None = None,
    skills_root: str | Path | None = None,
    diagnostics: RuntimeDiagnosticStore | None = None,
    thread_id: str | None = None,
    validation_runner: ValidationCommandRunner | None = None,
    automatic_completion_repair: bool = False,
    telemetry: CreatorRunTelemetry | None = None,
    max_retries: int = DEFAULT_CREATOR_MODEL_MAX_RETRIES,
    recovery_factory: Callable[[], BaseChatModel] | None = None,
) -> CreatorDomainWriteAgent:
    _register_minimal_harness_profile(model)
    policy = (
        MinimalAgentPathPolicy.development()
        if mode == "development"
        else MinimalAgentPathPolicy.conformance()
    )
    backend = PolicyFilesystemBackend(workspace, policy, activity=activity)
    skills_backend = create_domain_skills_backend(
        backend, skills_root or default_creator_skills_root()
    )
    client = project_control or ProjectControlClient(project_root=Path(workspace))
    coordinator = mutation_coordinator or ProjectMutationCoordinator()
    diagnostic_store = diagnostics or RuntimeDiagnosticStore()
    service = AppUIModelMutationService(
        project_root=workspace,
        project_control=client,
        activity=backend.activity,
        mutation_coordinator=coordinator,
        runtime_diagnostics=diagnostic_store,
        thread_id=thread_id,
    )
    observations = DomainObservationContext()
    repair_state = CreatorRepairState()
    source_creation = UISourceCreationService(
        project_root=workspace,
        activity=backend.activity,
        mutation_coordinator=coordinator,
    )
    service_contract_source_creation = UISourceCreationService(
        project_root=workspace,
        activity=backend.activity,
        mutation_coordinator=coordinator,
        path_policy=MinimalAgentPathPolicy.internal_source(),
    )
    plugin_creation = UIPluginCreationService(
        project_root=workspace,
        source_creation=source_creation,
        activity=backend.activity,
    )
    plugin_mutation = UIPluginSourceMutationService(
        project_root=workspace,
        activity=backend.activity,
        mutation_coordinator=coordinator,
    )
    service_authorizations = ServiceContractAuthorizationStore(
        workspace, thread_id=thread_id
    )
    service_authorization = ServiceContractAuthorizationService(
        project_root=workspace,
        project_control=client,
        store=service_authorizations,
    )
    service_creation = UIServiceContractCreationService(
        project_root=workspace,
        project_control=client,
        store=service_authorizations,
        source_creation=service_contract_source_creation,
    )
    service_mutation = UIServiceContractMutationService(
        project_root=workspace,
        project_control=client,
        store=service_authorizations,
        activity=backend.activity,
        mutation_coordinator=coordinator,
    )
    service_verifier = ServiceContractAuthorizationVerifier(
        project_control=client,
        store=service_authorizations,
    )

    def service_resource_resolver(
        name: str, arguments: dict[str, Any]
    ) -> tuple[str, ...]:
        authorization_id = arguments.get("authorizationId")
        if isinstance(authorization_id, str):
            try:
                record = service_authorizations.get_authorization(authorization_id)
                return (f"service:{record.spec.service_name}",)
            except Exception:
                pass
        if name == "edit_file":
            path = arguments.get("file_path")
            if isinstance(path, str):
                normalized = path if path.startswith("/") else f"/{path}"
                for record in service_authorizations.records():
                    contract_path = record.spec.contract_path
                    if normalized == (
                        contract_path
                        if contract_path.startswith("/")
                        else f"/{contract_path}"
                    ):
                        return (f"service:{record.spec.service_name}",)
        return ()

    run_control = CreatorRunControlState()
    scope_guard = ScopeAwareRecoveryGuard(
        run_control=run_control,
        service_resource_resolver=service_resource_resolver
    )
    validation = CreatorValidationService(
        project_root=workspace,
        activity=backend.activity,
        runner=validation_runner,
        repair_state=repair_state,
        host_verifier=service_verifier,
        scope=scope_guard.metrics,
    )
    scope_guard.set_baseline_capture(validation.ensure_baseline)
    if telemetry is not None:
        telemetry.bind(validation=validation)
    runtime_inspection = RuntimeDiagnosticInspectionService(
        store=diagnostic_store,
        thread_id=thread_id,
        project_control=client,
        observations=observations,
        activity=backend.activity,
        repair_state=repair_state,
    )
    completion_verification_tail = CompositionVerificationTail(
        activity=backend.activity,
        validation=validation,
        runtime=runtime_inspection,
        metrics=observations.composition_fast_path_metrics,
    )
    domain_tools = (
        *create_project_control_tools(
            client,
            observations=observations,
            activity=backend.activity,
        ),
        create_ui_plugin_tool(plugin_creation),
        mutate_ui_plugin_source_tool(plugin_mutation),
        *create_service_contract_tools(
            service_authorization,
            service_creation,
            service_mutation,
        ),
        create_app_ui_model_mutation_tool(service, observations),
        create_validation_tool(validation),
        create_runtime_diagnostic_tool(runtime_inspection),
        create_runtime_layout_tool(runtime_inspection),
    )
    metrics = ToolProtocolMetrics()
    protocol = ToolProtocolMiddleware(
        metrics=metrics,
        max_model_calls=24,
        raw_trace=raw_trace,
        provider_trace_collector=provider_trace_collector,
        run_control=run_control,
    )
    if telemetry is not None:
        telemetry.bind(
            activity=backend.activity,
            protocol=metrics,
            project_control=client.metrics,
            mutation=service.metrics,
            scope=scope_guard.metrics,
            composition_fast_path=observations.composition_fast_path_metrics,
            run_control=run_control,
        )
    model_retry = create_creator_model_retry_middleware(
        metrics=metrics,
        max_retries=max_retries,
        logger=backend.activity.logger,
        recovery_factory=recovery_factory,
    )
    runtime = MinimalAgentRuntimeGuard(
        backend,
        event_sink=event_sink,
        run_control=run_control,
    )
    repeated_read_guard = RepeatedProjectControlReadGuard(
        backend,
        run_control=run_control,
    )
    filesystem = FilesystemMiddleware(
        backend=skills_backend,
        tools=list(ALLOWED_MINIMAL_TOOLS),
        tool_token_limit_before_evict=None,
        human_message_token_limit_before_evict=None,
    )
    graph = create_deep_agent(
        model=model,
        tools=list(domain_tools),
        system_prompt=DOMAIN_WRITE_AGENT_PROMPT,
        backend=skills_backend,
        subagents=[],
        skills=["/skills/"],
        memory=None,
        middleware=[
            filesystem,
            DomainWriteToolPolicyMiddleware(),
            CompositionGroundingConvergenceMiddleware(
                observations,
                backend,
                protocol_metrics=metrics,
            ),
            scope_guard,
            repeated_read_guard,
            runtime,
            # Outer wrapper: every batch repair re-enters protocol accounting.
            DomainToolBatchPolicyMiddleware(
                metrics=metrics,
                run_control=run_control,
            ),
            model_retry,
            protocol,
            _NoSummaryMiddleware(),
        ],
        name="creator-python-domain-write-agent",
    )
    agent = CreatorDomainWriteAgent(
        graph=graph,
        protocol=protocol,
        runtime=runtime,
        repeated_read_guard=repeated_read_guard,
        project_control=client,
        observations=observations,
        mutation_service=service,
        completion_verification_tail=completion_verification_tail,
        completion_gate=CreatorDevelopmentCompletionGate(
            activity=backend.activity,
            validation=validation,
            runtime=runtime_inspection,
            repair_state=repair_state,
            service_authorization_finalizer=service_verifier,
            run_control=run_control,
        ),
        automatic_completion_repair=automatic_completion_repair,
        service_contract_authorizations=service_authorizations,
        scope_guard=scope_guard,
        run_control=run_control,
    )
    agent.source_creation = source_creation
    agent.plugin_mutation = plugin_mutation
    agent.service_contract_creation = service_creation
    agent.service_contract_mutation = service_mutation
    agent.validation = validation
    agent.runtime_inspection = runtime_inspection
    return agent
