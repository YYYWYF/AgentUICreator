from __future__ import annotations

import json
from collections.abc import AsyncIterable, Mapping
from typing import Any

from ..model_protocol.errors import ModelToolProtocolError
from .runtime_events import (
    CreatorEventSink,
    ToolInvocationFinished,
    ToolInvocationStarted,
)


def _bounded(value: Any, limit: int = 4096) -> str:
    content = getattr(value, "content", value)
    if isinstance(content, str):
        text = content
    else:
        try:
            text = json.dumps(content, ensure_ascii=False, default=str)
        except (TypeError, ValueError):
            text = repr(content)
    return text if len(text) <= limit else text[:limit] + "…"


class DeepAgentToolStreamAdapter:
    """Project official LangGraph v3 tool handles into Creator events."""

    def __init__(self, event_sink: CreatorEventSink | None) -> None:
        self.event_sink = event_sink
        self._seen_call_ids: set[str] = set()

    async def consume_all(self, tool_calls: AsyncIterable[Any]) -> None:
        async for call in tool_calls:
            await self.consume(call)

    async def consume(self, call: Any) -> None:
        call_id = getattr(call, "tool_call_id", None)
        if not isinstance(call_id, str) or not call_id:
            raise ModelToolProtocolError(
                "DeepAgents tool stream is missing the required correlation id."
            )

        duplicate = call_id in self._seen_call_ids
        if not duplicate:
            self._seen_call_ids.add(call_id)
            arguments = getattr(call, "input", None)
            if arguments is None:
                arguments = {}
            if not isinstance(arguments, Mapping):
                raise ModelToolProtocolError(
                    "DeepAgents tool stream produced non-object tool arguments."
                )
            if self.event_sink is not None:
                await self.event_sink.publish(
                    ToolInvocationStarted(
                        call_id=call_id,
                        name=str(getattr(call, "tool_name", "") or ""),
                        arguments=dict(arguments),
                    )
                )

        # Draining the official output-delta projection advances this call to its
        # terminal event. Creator currently publishes only the bounded final result.
        async for _ in call.output_deltas:
            pass

        if duplicate:
            return
        if not bool(getattr(call, "completed", False)):
            raise RuntimeError(
                f"DeepAgents tool stream closed before {call_id!r} completed."
            )

        error = getattr(call, "error", None)
        output = getattr(call, "output", None)
        status = str(getattr(output, "status", "success") or "success")
        if error is not None:
            status = "error"
            result = _bounded(error)
        else:
            result = _bounded(output)
        if self.event_sink is not None:
            await self.event_sink.publish(
                ToolInvocationFinished(
                    call_id=call_id,
                    result=result,
                    status=status,
                )
            )
