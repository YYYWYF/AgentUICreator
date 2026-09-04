from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any

from langchain.agents.middleware import AgentMiddleware

from ..domain_tools import DOMAIN_READ_TOOL_NAMES
from ..minimal_agent.path_policy import PolicyFilesystemBackend
from ..model_protocol.errors import AgentNoProgressError


class RepeatedProjectControlReadGuard(AgentMiddleware):
    """Reject the third identical domain read when no workspace write occurred."""

    def __init__(self, backend: PolicyFilesystemBackend) -> None:
        self.backend = backend
        self.repeated_reads = 0
        self._last_signature: str | None = None
        self._last_revision = backend.mutation_revision
        self._repeat_count = 0

    def _before(self, request: Any) -> None:
        call = dict(request.tool_call)
        name = str(call.get("name") or "")
        if name not in DOMAIN_READ_TOOL_NAMES:
            self._last_signature = None
            self._repeat_count = 0
            self._last_revision = self.backend.mutation_revision
            return
        arguments = call.get("args") if isinstance(call.get("args"), dict) else {}
        signature = json.dumps([name, arguments], ensure_ascii=False, sort_keys=True)
        revision = self.backend.mutation_revision
        if signature == self._last_signature and revision == self._last_revision:
            self._repeat_count += 1
            self.repeated_reads += 1
        else:
            self._repeat_count = 1
        self._last_signature = signature
        self._last_revision = revision
        if self._repeat_count >= 3:
            raise AgentNoProgressError(
                "The same ProjectControl read was requested three times without a workspace change."
            )

    def wrap_tool_call(self, request: Any, handler: Callable[[Any], Any]) -> Any:
        self._before(request)
        return handler(request)

    async def awrap_tool_call(
        self, request: Any, handler: Callable[[Any], Awaitable[Any]]
    ) -> Any:
        self._before(request)
        return await handler(request)

