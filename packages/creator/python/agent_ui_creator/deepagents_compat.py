"""Compose the existing Creator harness with DeepAgents 0.6 components.

The 0.6 factory appends custom middleware instead of replacing its defaults.
Creator already owns tool permissions and disables summarization, subagents,
memory, and filesystem eviction. Compile that explicit stack through the same
LangChain/LangGraph factory used by DeepAgents, without duplicate defaults.
"""

from collections.abc import Sequence
from typing import Any

from deepagents import DeepAgentState, __version__
from deepagents.backends.protocol import BackendProtocol
from deepagents.graph import BASE_AGENT_PROMPT
from deepagents.middleware.filesystem import FilesystemMiddleware
from deepagents.middleware.patch_tool_calls import PatchToolCallsMiddleware
from deepagents.middleware.skills import SkillsMiddleware
from langchain.agents import create_agent
from langchain.agents.middleware import AgentMiddleware
from langchain_core.language_models import BaseChatModel


def create_creator_filesystem_middleware(
    *, backend: BackendProtocol, tools: Sequence[str],
) -> FilesystemMiddleware:
    middleware = FilesystemMiddleware(
        backend=backend,
        tool_token_limit_before_evict=None,
        human_message_token_limit_before_evict=None,
    )
    # DeepAgents 0.6 provides the tool list but no tools= constructor option.
    allowed = frozenset(tools)
    middleware.tools = [tool for tool in middleware.tools if tool.name in allowed]
    return middleware


def create_creator_deep_agent(
    *, model: BaseChatModel, system_prompt: str, backend: BackendProtocol,
    middleware: Sequence[AgentMiddleware], name: str,
    tools: Sequence[Any] = (), skills: list[str] | None = None,
    checkpointer: Any = None,
) -> Any:
    stack: list[AgentMiddleware] = []
    if skills is not None:
        stack.append(SkillsMiddleware(backend=backend, sources=skills))
    stack.append(PatchToolCallsMiddleware())
    stack.extend(middleware)
    return create_agent(
        model,
        system_prompt=f"{system_prompt}\n\n{BASE_AGENT_PROMPT}",
        tools=list(tools),
        middleware=stack,
        checkpointer=checkpointer,
        name=name,
        state_schema=DeepAgentState,
    ).with_config({
        "recursion_limit": 9_999,
        "metadata": {
            "ls_integration": "deepagents",
            "lc_versions": {"deepagents": __version__},
            "lc_agent_name": name,
        },
    })
