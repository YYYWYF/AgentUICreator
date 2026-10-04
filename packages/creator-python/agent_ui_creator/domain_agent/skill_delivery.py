from __future__ import annotations

from collections.abc import Awaitable, Callable
from hashlib import sha256
from typing import Any

from langchain.agents.middleware import AgentMiddleware

from .skills import ReadOnlySkillsBackend


class SkillDeliveryMiddleware(AgentMiddleware):
    """Record tool-visible Skill reads, not Backend startup scans."""

    def __init__(self, backend: ReadOnlySkillsBackend, logger: Any = None) -> None:
        self.backend = backend
        self.logger = logger
        self.deliveries: list[dict[str, object]] = []

    def _observe(self, request: Any, result: Any) -> None:
        call = request.tool_call
        if call.get("name") != "read_file" or getattr(result, "status", None) != "success":
            return
        args = call.get("args") if isinstance(call.get("args"), dict) else {}
        path = args.get("file_path")
        if not isinstance(path, str) or not path.startswith("/skills/"):
            return
        backend_path = path.removeprefix("/skills")
        observation = (self.backend.last_read.get(backend_path)
                       or self.backend.last_read.get(backend_path.lstrip("/")))
        if observation is None:
            return
        offset, next_offset, total_lines = observation
        content = getattr(result, "content", "")
        item: dict[str, object] = {
            "path": path, "state": "delivered" if offset == 0 and next_offset is None else "partial",
            "offset": offset, "nextOffset": next_offset,
            "totalLines": total_lines,
            "chars": len(content) if isinstance(content, str) else 0,
            "utf8Bytes": len(content.encode("utf-8")) if isinstance(content, str) else 0,
            "contentId": sha256(content.encode("utf-8")).hexdigest() if isinstance(content, str) else None,
        }
        self.deliveries.append(item)
        if self.logger is not None:
            self.logger.record("creator_skill_delivery", item)

    def wrap_tool_call(self, request: Any, handler: Callable[[Any], Any]) -> Any:
        result = handler(request)
        self._observe(request, result)
        return result

    async def awrap_tool_call(
        self, request: Any, handler: Callable[[Any], Awaitable[Any]]
    ) -> Any:
        result = await handler(request)
        self._observe(request, result)
        return result
