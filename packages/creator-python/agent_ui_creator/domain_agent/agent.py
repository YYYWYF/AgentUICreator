from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Literal

import httpx
import openai
from deepagents import create_deep_agent
from deepagents.middleware.filesystem import FilesystemMiddleware
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.errors import GraphRecursionError
from langgraph.types import Command

from ..activity import CreatorActivityRecorder
from ..app_ui_model import (
    AppUIModelMutationError,
    AppUIModelMutationMetrics,
    AppUIModelMutationService,
    ProjectMutationCoordinator,
)
from ..app_ui_model.mutation_tool import create_app_ui_model_mutation_tool
from ..domain_tools import CreatorRecoveryQueries, create_project_control_tools, create_recovery_query_tools, create_recovery_undo_tool
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
from ..human_input import ask_user_question
from ..observability import CreatorRunTelemetry
from ..operations.models import CreatorAuthoringHandoff
from ..plugin_development.authority import PluginDevelopmentAuthority
from ..plugin_development.delivery import create_plugin_delivery_tool, delivery_status_satisfies_mode
from ..plugin_development.behavior import create_plugin_behavior_tool
from ..plugin_development.prepare_tool import create_prepare_ui_plugin_development_tool
from ..plugin_development.admission_middleware import PluginDevelopmentAdmissionMiddleware
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
from ..streaming.deepagent_v3_runner import DeepAgentCompleted, DeepAgentInterrupted, DeepAgentV3Runner
from ..streaming.runtime_events import CreatorEventSink
from ..validation import (
    CreatorValidationService,
    ValidationCommandRunner,
    create_validation_tool,
)
from ..verification_policy import (
    CreatorVerificationMode,
    DEFAULT_CREATOR_VERIFICATION_MODE,
)
from .completion_gate import CreatorDevelopmentCompletionGate
from .composition_verification_tail import CompositionVerificationTail
from .grounding_convergence import CompositionGroundingConvergenceMiddleware
from .source_grounding import (
    SourceGroundingConvergenceMiddleware, SourceGroundingMetrics,
    create_edit_file_from_read_tool,
)
from .change_scope import (
    ScopeAwareRecoveryGuard,
    build_change_layer_run_metrics,
)
from .prompt import (
    DOMAIN_ANSWER_AGENT_PROMPT,
    DOMAIN_INSPECT_AGENT_PROMPT,
    DOMAIN_READ_AGENT_PROMPT,
    DOMAIN_WRITE_AGENT_PROMPT,
    creator_verification_prompt,
)
from .runtime_guard import RepeatedProjectControlReadGuard
from .skills import create_domain_skills_backend, default_creator_skills_root
from .tool_batch_policy import DomainToolBatchPolicyMiddleware
from .tool_policy import ALLOWED_INSPECT_READ_ONLY_TOOLS, ANSWER_ONLY_FORBIDDEN_TOOL_NAMES, SIDE_EFFECT_TOOL_NAMES, DomainReadToolPolicyMiddleware, DomainWriteToolPolicyMiddleware


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
    completion_reason: str | None = field(default=None, kw_only=True)


@dataclass(frozen=True, slots=True)
class DomainWriteAgentResult(DomainReadAgentResult):
    app_ui_model_mutations: AppUIModelMutationMetrics
    change_layer_metrics: dict[str, object]
    composition_fast_path_metrics: CompositionFastPathMetrics
    source_grounding_metrics: SourceGroundingMetrics | None = None


def _completion_from_verification(
    completion: CompletionStatus, receipt: dict[str, Any]
) -> CompletionStatus:
    if not receipt.get("files"):
        return completion
    status = receipt.get("verification", {}).get("status")
    if status == "changed-unverified":
        return "committed_unverified" if completion != "blocked" else completion
    if status not in {"changed-and-verified", "changed-and-statically-verified"}:
        return "blocked"
    return completion


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
        plugin_development_authority: PluginDevelopmentAuthority | None = None,
        scope_guard: ScopeAwareRecoveryGuard | None = None,
        run_control: CreatorRunControlState | None = None,
        thread_id: str | None = None,
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
        self.plugin_development_authority = plugin_development_authority
        self.scope_guard = scope_guard
        self.run_control = run_control or CreatorRunControlState()
        self.thread_id = thread_id

    async def run(self, prompt: str) -> DomainReadAgentResult:
        return await self.run_messages([{"role": "user", "content": prompt}])

    async def run_messages(
        self, messages: list[dict[str, str]], *, resume: dict[str, Any] | None = None
    ) -> DomainReadAgentResult | DeepAgentInterrupted:
        if self.plugin_development_authority is not None and self.plugin_development_authority.task_id is None:
            current_user_message = next((message["content"] for message in reversed(messages)
                                         if message.get("role") == "user"), "")
            self.plugin_development_authority.begin_task(
                task_id=self.activity.run_id, request_id=self.activity.run_id,
                user_message=current_user_message, intent="none",
            )
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
        async def invoke(input_messages: list[Any] | Command) -> DeepAgentCompleted | DeepAgentInterrupted:
            return await DeepAgentV3Runner().run_result(
                graph=self.graph,
                input=input_messages if isinstance(input_messages, Command) else {"messages": input_messages},
                config={"recursion_limit": 60, **({"configurable": {"thread_id": self.thread_id}} if self.thread_id else {})},
                event_sink=self.runtime.event_sink,
            )

        completion_decision = None
        state: Any = None
        terminal_blocked = False
        try:
            outcome = await invoke(Command(resume=resume) if resume is not None else messages)
            if isinstance(outcome, DeepAgentInterrupted):
                return outcome
            state = outcome.state
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
                outcome = await invoke(
                    [
                        *state_messages,
                        HumanMessage(content=completion_decision.feedback),
                    ]
                )
                if isinstance(outcome, DeepAgentInterrupted):
                    return outcome
                state = outcome.state
                await self._run_composition_verification_tail()
        except TerminalBlockerStop:
            terminal_blocked = True
        except GraphRecursionError as error:
            self.protocol.metrics.repeatedToolLoops += int(self.runtime.no_progress)
            raise AgentNoProgressError(
                "Creator Agent 的调用次数已达到上限，请缩小请求范围后重试。"
            ) from error
        except AgentNoProgressError:
            self.protocol.metrics.repeatedToolLoops += 1
            completed = await self._complete_after_composition_budget()
            if completed is not None:
                return completed
            raise
        except (httpx.TimeoutException, openai.APITimeoutError, TimeoutError) as error:
            raise ModelTimeoutError("Creator Agent 等待模型响应超时，请稍后重试。") from error
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
        if completion_decision is not None:
            if completion_decision.completion is not None:
                completion = completion_decision.completion
            if not completion_decision.accepted:
                completion = "blocked"
        completion = _completion_from_verification(
            completion, self.activity.snapshot()
        )
        if self.completion_gate is not None and any(
            not delivery_status_satisfies_mode(
                report["delivery"]["status"], self.completion_gate.verification_mode,
            )
            for report in self.activity.snapshot().get("pluginDeliveries", [])
        ):
            completion = "blocked"
        values = dict(
            text=text,
            metrics=self.protocol.metrics,
            project_control=self.project_control.metrics,
            repeated_project_control_reads=self.repeated_read_guard.repeated_reads,
            activities=tuple(self.runtime.activities),
            domain_observations=self.observations.metrics,
            completion=completion,
            completion_reason=None if completion_decision is None else completion_decision.reason,
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
            values["source_grounding_metrics"] = getattr(
                getattr(self, "source_grounding", None), "metrics", None,
            )
        return result_type(**values)

    async def _run_composition_verification_tail(self) -> None:
        recovery = getattr(self.completion_gate, "recovery", None)
        if recovery is not None and recovery.is_recovery_only():
            return
        if (
            self.completion_verification_tail is None
            or self.mutation_service is None
        ):
            return
        await self.completion_verification_tail.run_if_needed(
            self.mutation_service
        )

    async def _complete_after_composition_budget(self) -> DomainReadAgentResult | None:
        authority = self.plugin_development_authority
        if (
            authority is None or authority.active is None
            or authority.active.status != "authorized"
            or self.completion_gate is None
            or self.completion_verification_tail is None
            or self.mutation_service is None
            or self.run_control.blocked
        ):
            return None
        if self.mutation_service.last_result is None:
            if not await self._compose_authorized_default_after_budget():
                return None
        await self.completion_verification_tail.run_if_needed(
            self.mutation_service
        )
        validation_service = self.completion_gate.validation
        validation = validation_service.current_result()
        if validation is None or validation.revision != self.activity.revision:
            validation = await validation_service.validate(mode="delta")
        if validation.status != "passed" or validation.revision != self.activity.revision:
            return None
        self.runtime.raise_terminal_error()
        decision = self.completion_gate.review(
            "已按授权完成插件源码、组合及当前修订版的静态验证。"
        )
        reports = self.activity.snapshot().get("pluginDeliveries", [])
        if not decision.accepted or not reports or any(
            not delivery_status_satisfies_mode(
                report["delivery"]["status"], self.completion_gate.verification_mode,
            )
            for report in reports
        ):
            return None
        return self._build_result(text=decision.text, completion="success")

    async def _compose_authorized_default_after_budget(self) -> bool:
        record = self.plugin_development_authority.active
        if (
            record.delivery_scope != "full"
            or record.work_kind != "create-plugin"
            or record.created_plugin_id != record.target_plugin_id
        ):
            return False
        validation_service = self.completion_gate.validation
        validation = validation_service.current_result()
        if validation is None or validation.revision != self.activity.revision:
            validation = await validation_service.validate(mode="delta")
        if validation.status != "passed" or validation.revision != self.activity.revision:
            return False
        reports = self.completion_gate.inspect_deliveries()
        if len(reports) != 1 or reports[0].get("pluginId") != record.target_plugin_id:
            return False
        stages = reports[0]["delivery"]["stages"]
        if not stages["created"] or not stages["registered"] or stages["composed"]:
            return False
        snapshot = await self.project_control.inspect_ui_project(view="composition")
        model = snapshot.get("appUIModel") if isinstance(snapshot, dict) else None
        model_hash = model.get("hash") if isinstance(model, dict) else None
        if not isinstance(model_hash, str):
            return False
        try:
            await self.mutation_service.mutate(
                app_ui_model_hash=model_hash,
                operations=[{
                    "type": "insert_plugin_default",
                    "plugin": {
                        "id": f"{record.target_plugin_id}-main",
                        "pluginId": record.target_plugin_id,
                        "enabled": True,
                    },
                }],
            )
        except AppUIModelMutationError:
            return False
        return True

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
            "completion_reason": (self.run_control.blocker_dict() or {}).get("category"),
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
            values["source_grounding_metrics"] = getattr(
                getattr(self, "source_grounding", None), "metrics", None,
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
    permission_scope: Literal["legacy", "inspect_read_only"] = "legacy",
    answer_only: bool = False,
    raw_trace: bool = False,
    provider_trace_collector: ProviderResponseTraceCollector | None = None,
    project_control: ProjectControlClient | None = None,
    activity: CreatorActivityRecorder | None = None,
    event_sink: CreatorEventSink | None = None,
    telemetry: CreatorRunTelemetry | None = None,
    diagnostics: RuntimeDiagnosticStore | None = None,
    thread_id: str | None = None,
    checkpointer: Any = None,
    max_retries: int = DEFAULT_CREATOR_MODEL_MAX_RETRIES,
    recovery_factory: Callable[[], BaseChatModel] | None = None,
    verification_mode: CreatorVerificationMode = DEFAULT_CREATOR_VERIFICATION_MODE,
) -> CreatorDomainReadAgent:
    _register_minimal_harness_profile(model)
    policy = (
        MinimalAgentPathPolicy.inspect_read_only()
        if permission_scope == "inspect_read_only"
        else MinimalAgentPathPolicy.development()
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
    domain_tools = () if answer_only else (
        *create_recovery_query_tools(CreatorRecoveryQueries(workspace)),
        *create_project_control_tools(
            client,
            observations=observations,
            activity=backend.activity,
        ),
        ask_user_question,
    )
    if verification_mode == "static_and_runtime" and not answer_only:
        domain_tools = (*domain_tools, create_runtime_layout_tool(runtime_inspection))
    if permission_scope == "inspect_read_only":
        domain_tools = tuple(
            item for item in domain_tools
            if item.name in ALLOWED_INSPECT_READ_ONLY_TOOLS
        )
    metrics = ToolProtocolMetrics()
    run_control = CreatorRunControlState()
    protocol = ToolProtocolMiddleware(
        metrics=metrics,
        raw_trace=raw_trace,
        provider_trace_collector=provider_trace_collector,
        run_control=run_control,
        forbidden_tool_names=(
            ANSWER_ONLY_FORBIDDEN_TOOL_NAMES if answer_only
            else SIDE_EFFECT_TOOL_NAMES if permission_scope == "inspect_read_only"
            else frozenset()
        ),
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
    # DeepAgents requires read_file in an explicit filesystem allowlist.
    # The answer-only model still receives no tools through DomainReadToolPolicyMiddleware.
    filesystem_tools = (
        ["read_file"] if answer_only
        else [
            name for name in ALLOWED_MINIMAL_TOOLS
            if permission_scope != "inspect_read_only" or name != "edit_file"
        ]
    )
    filesystem = FilesystemMiddleware(
        backend=backend,
        tools=filesystem_tools,
        tool_token_limit_before_evict=None,
        human_message_token_limit_before_evict=None,
    )
    graph = create_deep_agent(
        model=model,
        tools=list(domain_tools),
        checkpointer=checkpointer,
        system_prompt=creator_verification_prompt(
            DOMAIN_ANSWER_AGENT_PROMPT
            if answer_only
            else DOMAIN_INSPECT_AGENT_PROMPT
            if permission_scope == "inspect_read_only"
            else DOMAIN_READ_AGENT_PROMPT,
            verification_mode,
        ),
        backend=backend,
        subagents=[],
        skills=None,
        memory=None,
        middleware=[
            filesystem,
            DomainReadToolPolicyMiddleware(
                verification_mode,
                inspect_read_only=permission_scope == "inspect_read_only",
                answer_only=answer_only,
            ),
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
        thread_id=thread_id,
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
    checkpointer: Any = None,
    validation_runner: ValidationCommandRunner | None = None,
    automatic_completion_repair: bool = False,
    telemetry: CreatorRunTelemetry | None = None,
    max_retries: int = DEFAULT_CREATOR_MODEL_MAX_RETRIES,
    recovery_factory: Callable[[], BaseChatModel] | None = None,
    verification_mode: CreatorVerificationMode = DEFAULT_CREATOR_VERIFICATION_MODE,
    plugin_development_authority: PluginDevelopmentAuthority | None = None,
    authoring_handoff: CreatorAuthoringHandoff | None = None,
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
    development_authority = plugin_development_authority or PluginDevelopmentAuthority(
        workspace, thread_id=thread_id or "local", skills_root=skills_root,
    )
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
        development_authority=development_authority,
        project_control=client,
    )
    plugin_mutation = UIPluginSourceMutationService(
        project_root=workspace,
        activity=backend.activity,
        mutation_coordinator=coordinator,
        development_authority=development_authority,
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
        if name in {"edit_file", "edit_file_from_read"}:
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
        project_root=str(workspace),
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
        project_control=client,
        mutation_coordinator=coordinator,
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
        verification_mode=verification_mode,
    )
    recovery_queries = CreatorRecoveryQueries(workspace, activity=backend.activity, run_control=run_control)
    completion_gate = CreatorDevelopmentCompletionGate(
        recovery=recovery_queries, activity=backend.activity, validation=validation, runtime=runtime_inspection,
        repair_state=repair_state, service_authorization_finalizer=service_verifier,
        run_control=run_control, verification_mode=verification_mode,
        plugin_development_authority=development_authority,
    )
    backend.activity.plugin_delivery_provider = completion_gate.inspect_deliveries
    domain_tools = [
        ask_user_question,
        *create_project_control_tools(
            client,
            observations=observations,
            activity=backend.activity,
        ),
        create_ui_plugin_tool(plugin_creation),
        create_prepare_ui_plugin_development_tool(development_authority),
        create_plugin_behavior_tool(authority=development_authority, activity=backend.activity),
        create_plugin_delivery_tool(completion_gate.inspect_deliveries),
        mutate_ui_plugin_source_tool(plugin_mutation),
        *create_service_contract_tools(
            service_authorization,
            service_creation,
            service_mutation,
        ),
        create_app_ui_model_mutation_tool(
            service,
            observations,
            verification_mode=verification_mode,
        ),
        create_validation_tool(validation),
    ]
    domain_tools.extend((*create_recovery_query_tools(recovery_queries),
                         create_recovery_undo_tool(recovery_queries)))
    if verification_mode == "static_and_runtime":
        domain_tools.extend(
            [
                create_runtime_diagnostic_tool(runtime_inspection),
                create_runtime_layout_tool(runtime_inspection),
            ]
        )
    metrics = ToolProtocolMetrics()
    source_grounding = SourceGroundingConvergenceMiddleware(
        backend, authoring_handoff, metrics,
    )
    domain_tools.append(create_edit_file_from_read_tool(backend, source_grounding))
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
            source_grounding=source_grounding.metrics,
            recovery=recovery_queries,
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
        tools=domain_tools,
        checkpointer=checkpointer,
        system_prompt=creator_verification_prompt(
            DOMAIN_WRITE_AGENT_PROMPT, verification_mode
        ),
        backend=skills_backend,
        subagents=[],
        skills=["/skills/"],
        memory=None,
        middleware=[
            filesystem,
            DomainWriteToolPolicyMiddleware(verification_mode),
            PluginDevelopmentAdmissionMiddleware(development_authority),
            CompositionGroundingConvergenceMiddleware(
                observations,
                backend,
                protocol_metrics=metrics,
                verification_mode=verification_mode,
                development_authority=development_authority,
            ),
            source_grounding,
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
        completion_gate=completion_gate,
        automatic_completion_repair=automatic_completion_repair,
        service_contract_authorizations=service_authorizations,
        plugin_development_authority=development_authority,
        scope_guard=scope_guard,
        run_control=run_control,
        thread_id=thread_id,
    )
    agent.source_creation = source_creation
    agent.plugin_mutation = plugin_mutation
    agent.service_contract_creation = service_creation
    agent.service_contract_mutation = service_mutation
    agent.validation = validation
    agent.source_grounding = source_grounding
    agent.runtime_inspection = runtime_inspection
    return agent
