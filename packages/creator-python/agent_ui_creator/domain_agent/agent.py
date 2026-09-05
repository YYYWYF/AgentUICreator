from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import httpx
import openai
from deepagents import create_deep_agent
from deepagents.middleware.filesystem import FilesystemMiddleware
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage
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
from ..streaming.deepagent_v3_runner import DeepAgentV3Runner
from ..streaming.runtime_events import CreatorEventSink
from .prompt import DOMAIN_READ_AGENT_PROMPT, DOMAIN_WRITE_AGENT_PROMPT
from .runtime_guard import RepeatedProjectControlReadGuard
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
    ) -> None:
        self.graph = graph
        self.protocol = protocol
        self.runtime = runtime
        self.repeated_read_guard = repeated_read_guard
        self.project_control = project_control
        self.observations = observations
        self.mutation_service = mutation_service
        self.activity = runtime.backend.activity

    async def run(self, prompt: str) -> DomainReadAgentResult:
        return await self.run_messages([{"role": "user", "content": prompt}])

    async def run_messages(
        self, messages: list[dict[str, str]]
    ) -> DomainReadAgentResult:
        try:
            state = await DeepAgentV3Runner().run(
                graph=self.graph,
                input={"messages": messages},
                config={"recursion_limit": 30},
                event_sink=self.runtime.event_sink,
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
        values = dict(
            text="" if final is None else _message_text(final).strip(),
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
) -> CreatorDomainWriteAgent:
    _register_minimal_harness_profile(model)
    policy = (
        MinimalAgentPathPolicy.development()
        if mode == "development"
        else MinimalAgentPathPolicy.conformance()
    )
    backend = PolicyFilesystemBackend(workspace, policy, activity=activity)
    client = project_control or ProjectControlClient(project_root=Path(workspace))
    service = AppUIModelMutationService(
        project_root=workspace,
        project_control=client,
        activity=backend.activity,
        mutation_coordinator=mutation_coordinator or ProjectMutationCoordinator(),
    )
    observations = DomainObservationContext()
    domain_tools = (
        *create_project_control_tools(
            client,
            observations=observations,
            activity=backend.activity,
        ),
        create_app_ui_model_mutation_tool(service, observations),
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
        system_prompt=DOMAIN_WRITE_AGENT_PROMPT,
        backend=backend,
        subagents=[],
        skills=None,
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
    return CreatorDomainWriteAgent(
        graph=graph,
        protocol=protocol,
        runtime=runtime,
        repeated_read_guard=repeated_read_guard,
        project_control=client,
        observations=observations,
        mutation_service=service,
    )
