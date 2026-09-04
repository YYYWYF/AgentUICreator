from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping, Sequence
from typing import Any

from langchain.agents.middleware import AgentMiddleware, ModelRequest, ModelResponse

ALLOWED_MINIMAL_TOOLS = ("ls", "read_file", "glob", "grep", "edit_file")
_ALLOWED_MINIMAL_TOOL_SET = frozenset(ALLOWED_MINIMAL_TOOLS)


def tool_name(tool: Any) -> str:
    if isinstance(tool, Mapping):
        if tool.get("name"):
            return str(tool["name"])
        function = tool.get("function")
        return str(function.get("name") or "") if isinstance(function, Mapping) else ""
    return str(getattr(tool, "name", "") or "")


def filter_minimal_tools(tools: Sequence[Any]) -> list[Any]:
    return [tool for tool in tools if tool_name(tool) in _ALLOWED_MINIMAL_TOOL_SET]


class MinimalAgentToolPolicyMiddleware(AgentMiddleware):
    """Apply the Phase-2 tool allowlist before every model request."""

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        return handler(request.override(tools=filter_minimal_tools(request.tools)))

    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelResponse:
        return await handler(request.override(tools=filter_minimal_tools(request.tools)))

