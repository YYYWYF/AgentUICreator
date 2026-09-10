from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

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
from ..domain_state import DomainObservationContext, DomainObservationMetrics
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
from ..model_protocol.tool_protocol_guard import ToolProtocolMiddleware
from ..model_protocol.trace import ToolProtocolMetrics
from ..project_control import ProjectControlClient, ProjectControlMetrics
from ..repair import CreatorRepairState
from ..runtime_diagnostics import (
    RuntimeDiagnosticInspectionService,
    RuntimeDiagnosticStore,
    create_runtime_diagnostic_tool,
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


@dataclass(frozen=True, slots=True)
class DomainWriteAgentResult(DomainReadAgentResult):
    app_ui_model_mutations: AppUIModelMutationMetrics


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
        automatic_completion_repair: bool = False,
        service_contract_authorizations: ServiceContractAuthorizationStore | None = None,
    ) -> None:
        self.graph = graph
        self.protocol = protocol
        self.runtime = runtime
        self.repeated_read_guard = repeated_read_guard
        self.project_control = project_control
        self.observations = observations
        self.mutation_service = mutation_service
        self.completion_gate = completion_gate
        self.automatic_completion_repair = automatic_completion_repair
        self.activity = runtime.backend.activity
        self.service_contract_authorizations = service_contract_authorizations

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
                config={"recursion_limit": 30},
                event_sink=self.runtime.event_sink,
            )

        completion_decision = None
        try:
            state = await invoke(messages)
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
                state = await invoke(
                    [
                        *state_messages,
                        HumanMessage(content=completion_decision.feedback),
                    ]
                )
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
        self.runtime.raise_terminal_error()
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
        values = dict(
            text=text,
            metrics=self.protocol.metrics,
            project_control=self.project_control.metrics,
            repeated_project_control_reads=self.repeated_read_guard.repeated_reads,
            activities=tuple(self.runtime.activities),
            domain_observations=self.observations.metrics,
        )
        if self.mutation_service is not None:
            values["app_ui_model_mutations"] = self.mutation_service.metrics
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
    domain_tools = create_project_control_tools(
        client,
        observations=observations,
        activity=backend.activity,
    )
    metrics = ToolProtocolMetrics()
    protocol = ToolProtocolMiddleware(
        metrics=metrics,
        raw_trace=raw_trace,
        provider_trace_collector=provider_trace_collector,
    )
    runtime = MinimalAgentRuntimeGuard(backend, event_sink=event_sink)
    repeated_read_guard = RepeatedProjectControlReadGuard(backend)
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
    validation = CreatorValidationService(
        project_root=workspace,
        activity=backend.activity,
        runner=validation_runner,
        repair_state=repair_state,
        host_verifier=service_verifier,
    )
    runtime_inspection = RuntimeDiagnosticInspectionService(
        store=diagnostic_store,
        thread_id=thread_id,
        project_control=client,
        observations=observations,
        activity=backend.activity,
        repair_state=repair_state,
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
    )
    metrics = ToolProtocolMetrics()
    protocol = ToolProtocolMiddleware(
        metrics=metrics,
        max_model_calls=24,
        raw_trace=raw_trace,
        provider_trace_collector=provider_trace_collector,
    )
    runtime = MinimalAgentRuntimeGuard(backend, event_sink=event_sink)
    repeated_read_guard = RepeatedProjectControlReadGuard(backend)
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
            repeated_read_guard,
            runtime,
            # Outer wrapper: every batch repair re-enters protocol accounting.
            DomainToolBatchPolicyMiddleware(metrics=metrics),
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
        completion_gate=CreatorDevelopmentCompletionGate(
            activity=backend.activity,
            validation=validation,
            runtime=runtime_inspection,
            repair_state=repair_state,
            service_authorization_finalizer=service_verifier,
        ),
        automatic_completion_repair=automatic_completion_repair,
        service_contract_authorizations=service_authorizations,
    )
    agent.source_creation = source_creation
    agent.plugin_mutation = plugin_mutation
    agent.service_contract_creation = service_creation
    agent.service_contract_mutation = service_mutation
    agent.validation = validation
    agent.runtime_inspection = runtime_inspection
    return agent
