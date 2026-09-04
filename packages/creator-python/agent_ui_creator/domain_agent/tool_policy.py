from __future__ import annotations

from collections.abc import Awaitable, Callable, Sequence
from typing import Any

from langchain.agents.middleware import AgentMiddleware, ModelRequest, ModelResponse

from ..domain_tools import DOMAIN_READ_TOOL_NAMES
from ..minimal_agent.tool_policy import ALLOWED_MINIMAL_TOOLS, tool_name

ALLOWED_DOMAIN_READ_TOOLS = (*ALLOWED_MINIMAL_TOOLS, *DOMAIN_READ_TOOL_NAMES)
_ALLOWED_DOMAIN_READ_TOOL_SET = frozenset(ALLOWED_DOMAIN_READ_TOOLS)


def filter_domain_read_tools(tools: Sequence[Any]) -> list[Any]:
    return [tool for tool in tools if tool_name(tool) in _ALLOWED_DOMAIN_READ_TOOL_SET]


class DomainReadToolPolicyMiddleware(AgentMiddleware):
    """Apply the Phase-3A filesystem plus domain-read allowlist on every model call."""

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        return handler(request.override(tools=filter_domain_read_tools(request.tools)))

    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelResponse:
        return await handler(request.override(tools=filter_domain_read_tools(request.tools)))

