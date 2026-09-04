from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass
from typing import Any

from langchain.agents.middleware import AgentMiddleware

from ..model_protocol.errors import AgentNoProgressError, ToolPermissionDeniedError
from .path_policy import PolicyFilesystemBackend


@dataclass(frozen=True, slots=True)
class ToolActivity:
    callId: str
    name: str
    arguments: dict[str, Any]
    status: str
    result: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _bounded(value: Any, limit: int = 4096) -> str:
    if isinstance(value, str):
        text = value
    else:
        try:
            text = json.dumps(value, ensure_ascii=False, default=str)
        except (TypeError, ValueError):
            text = repr(value)
    return text if len(text) <= limit else text[:limit] + "…"


class MinimalAgentRuntimeGuard(AgentMiddleware):
    """Capture tool activity and stop repeated calls that make no progress."""

    def __init__(self, backend: PolicyFilesystemBackend):
        self.backend = backend
        self.activities: list[ToolActivity] = []
        self._last_signature: str | None = None
        self._last_revision = backend.mutation_revision
        self._repeat_count = 0
        self.no_progress = False
        self.permission_denied = False

    def assert_runnable(self) -> None:
        if self.no_progress:
            raise AgentNoProgressError(
                "The same tool and arguments were repeated three times without a workspace change."
            )

    def _before(self, request: Any) -> tuple[dict[str, Any], str]:
        self.assert_runnable()
        call = dict(request.tool_call)
        arguments = call.get("args") if isinstance(call.get("args"), dict) else {}
        signature = json.dumps(
            [call.get("name"), arguments], ensure_ascii=False, sort_keys=True, default=str
        )
        return call, signature

    def _after(self, call: dict[str, Any], signature: str, result: Any) -> Any:
        revision = self.backend.mutation_revision
        if signature == self._last_signature and revision == self._last_revision:
            self._repeat_count += 1
        else:
            self._repeat_count = 1
        self._last_signature = signature
        self._last_revision = revision
        if self._repeat_count >= 3:
            self.no_progress = True

        content = _bounded(getattr(result, "content", result))
        status = str(getattr(result, "status", "success") or "success")
        if "TOOL_PERMISSION_DENIED" in content:
            self.permission_denied = True
        self.activities.append(
            ToolActivity(
                callId=str(call.get("id") or ""),
                name=str(call.get("name") or ""),
                arguments=call.get("args") if isinstance(call.get("args"), dict) else {},
                status=status,
                result=content,
            )
        )
        return result

    def wrap_tool_call(self, request: Any, handler: Callable[[Any], Any]) -> Any:
        call, signature = self._before(request)
        return self._after(call, signature, handler(request))

    async def awrap_tool_call(
        self, request: Any, handler: Callable[[Any], Awaitable[Any]]
    ) -> Any:
        call, signature = self._before(request)
        return self._after(call, signature, await handler(request))

    def wrap_model_call(self, request: Any, handler: Callable[[Any], Any]) -> Any:
        self.assert_runnable()
        return handler(request)

    async def awrap_model_call(
        self, request: Any, handler: Callable[[Any], Awaitable[Any]]
    ) -> Any:
        self.assert_runnable()
        return await handler(request)

    def raise_terminal_error(self) -> None:
        self.assert_runnable()
        if self.permission_denied:
            raise ToolPermissionDeniedError("Minimal agent attempted a forbidden filesystem path.")
