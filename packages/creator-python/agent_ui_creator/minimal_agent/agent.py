from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import httpx
import openai
from deepagents import (
    GeneralPurposeSubagentProfile,
    HarnessProfile,
    create_deep_agent,
    register_harness_profile,
)
from deepagents.middleware.filesystem import FilesystemMiddleware
from langchain.agents.middleware import AgentMiddleware
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage
from langgraph.errors import GraphRecursionError

from ..model_protocol.errors import AgentNoProgressError, ModelTimeoutError
from ..model_protocol.provider_trace import ProviderResponseTraceCollector
from ..model_protocol.tool_protocol_guard import ToolProtocolMiddleware
from ..model_protocol.trace import ToolProtocolMetrics
from .path_policy import MinimalAgentPathPolicy, PolicyFilesystemBackend
from .prompt import MINIMAL_AGENT_PROMPT
from .runtime_guard import MinimalAgentRuntimeGuard, ToolActivity
from .tool_policy import ALLOWED_MINIMAL_TOOLS, MinimalAgentToolPolicyMiddleware


class _NoSummaryMiddleware(AgentMiddleware):
    """Replace DeepAgents summarization with a no-op for short Phase-2 runs."""

    @property
    def name(self) -> str:
        return "SummarizationMiddleware"


@dataclass(frozen=True, slots=True)
class MinimalAgentResult:
    text: str
    metrics: ToolProtocolMetrics
    activities: tuple[ToolActivity, ...]


def _message_text(message: AIMessage) -> str:
    if isinstance(message.content, str):
        return message.content
    return "".join(
        str(block if isinstance(block, str) else block.get("text") or "")
        for block in message.content
        if isinstance(block, (str, dict))
    )


class CreatorMinimalAgent:
    def __init__(
        self,
        *,
        graph: Any,
        protocol: ToolProtocolMiddleware,
        runtime: MinimalAgentRuntimeGuard,
    ) -> None:
        self.graph = graph
        self.protocol = protocol
        self.runtime = runtime

    async def run(self, prompt: str) -> MinimalAgentResult:
        try:
            state = await self.graph.ainvoke(
                {"messages": [{"role": "user", "content": prompt}]},
                config={"recursion_limit": 30},
            )
        except GraphRecursionError as error:
            self.protocol.metrics.repeatedToolLoops += int(self.runtime.no_progress)
            raise AgentNoProgressError("Minimal agent exceeded its recursion limit.") from error
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
        text = "" if final is None else _message_text(final).strip()
        return MinimalAgentResult(
            text=text,
            metrics=self.protocol.metrics,
            activities=tuple(self.runtime.activities),
        )


def _register_minimal_harness_profile(model: BaseChatModel) -> None:
    model_name = str(getattr(model, "model_name", "") or "")
    if not model_name:
        return
    register_harness_profile(
        f"openai:{model_name}",
        HarnessProfile(
            excluded_tools=frozenset(
                {"task", "write_todos", "execute", "write_file", "delete"}
            ),
            excluded_middleware=frozenset({"SummarizationMiddleware"}),
            general_purpose_subagent=GeneralPurposeSubagentProfile(enabled=False),
        ),
    )


def create_minimal_creator_agent(
    *,
    model: BaseChatModel,
    workspace: str | Path,
    mode: Literal["development", "conformance"] = "development",
    raw_trace: bool = False,
    provider_trace_collector: ProviderResponseTraceCollector | None = None,
) -> CreatorMinimalAgent:
    _register_minimal_harness_profile(model)
    policy = (
        MinimalAgentPathPolicy.development()
        if mode == "development"
        else MinimalAgentPathPolicy.conformance()
    )
    backend = PolicyFilesystemBackend(workspace, policy)
    metrics = ToolProtocolMetrics()
    protocol = ToolProtocolMiddleware(
        metrics=metrics,
        raw_trace=raw_trace,
        provider_trace_collector=provider_trace_collector,
    )
    runtime = MinimalAgentRuntimeGuard(backend)
    filesystem = FilesystemMiddleware(
        backend=backend,
        tools=list(ALLOWED_MINIMAL_TOOLS),
        tool_token_limit_before_evict=None,
        human_message_token_limit_before_evict=None,
    )
    graph = create_deep_agent(
        model=model,
        system_prompt=MINIMAL_AGENT_PROMPT,
        backend=backend,
        subagents=[],
        skills=None,
        memory=None,
        middleware=[
            filesystem,
            MinimalAgentToolPolicyMiddleware(),
            runtime,
            protocol,
            _NoSummaryMiddleware(),
        ],
        name="creator-python-minimal-agent",
    )
    return CreatorMinimalAgent(graph=graph, protocol=protocol, runtime=runtime)
