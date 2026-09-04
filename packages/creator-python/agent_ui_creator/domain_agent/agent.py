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

from ..domain_tools import create_project_control_tools
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
from .prompt import DOMAIN_READ_AGENT_PROMPT
from .runtime_guard import RepeatedProjectControlReadGuard
from .tool_policy import DomainReadToolPolicyMiddleware


@dataclass(frozen=True, slots=True)
class DomainReadAgentResult:
    text: str
    metrics: ToolProtocolMetrics
    project_control: ProjectControlMetrics
    repeated_project_control_reads: int
    activities: tuple[ToolActivity, ...]


class CreatorDomainReadAgent:
    def __init__(
        self,
        *,
        graph: Any,
        protocol: ToolProtocolMiddleware,
        runtime: MinimalAgentRuntimeGuard,
        repeated_read_guard: RepeatedProjectControlReadGuard,
        project_control: ProjectControlClient,
    ) -> None:
        self.graph = graph
        self.protocol = protocol
        self.runtime = runtime
        self.repeated_read_guard = repeated_read_guard
        self.project_control = project_control

    async def run(self, prompt: str) -> DomainReadAgentResult:
        try:
            state = await self.graph.ainvoke(
                {"messages": [{"role": "user", "content": prompt}]},
                config={"recursion_limit": 30},
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
        return DomainReadAgentResult(
            text="" if final is None else _message_text(final).strip(),
            metrics=self.protocol.metrics,
            project_control=self.project_control.metrics,
            repeated_project_control_reads=self.repeated_read_guard.repeated_reads,
            activities=tuple(self.runtime.activities),
        )


def create_domain_read_creator_agent(
    *,
    model: BaseChatModel,
    workspace: str | Path,
    mode: Literal["development", "conformance"] = "development",
    raw_trace: bool = False,
    provider_trace_collector: ProviderResponseTraceCollector | None = None,
    project_control: ProjectControlClient | None = None,
) -> CreatorDomainReadAgent:
    _register_minimal_harness_profile(model)
    policy = (
        MinimalAgentPathPolicy.development()
        if mode == "development"
        else MinimalAgentPathPolicy.conformance()
    )
    backend = PolicyFilesystemBackend(workspace, policy)
    client = project_control or ProjectControlClient(project_root=Path(workspace))
    domain_tools = create_project_control_tools(client)
    metrics = ToolProtocolMetrics()
    protocol = ToolProtocolMiddleware(
        metrics=metrics,
        raw_trace=raw_trace,
        provider_trace_collector=provider_trace_collector,
    )
    runtime = MinimalAgentRuntimeGuard(backend)
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
    )

