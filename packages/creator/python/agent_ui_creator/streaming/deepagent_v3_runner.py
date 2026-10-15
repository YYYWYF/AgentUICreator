from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from ..model_protocol.errors import DeepAgentEventStreamUnavailableError
from .deepagent_tool_stream import DeepAgentToolStreamAdapter
from .runtime_events import AssistantTextStarted, AssistantTextDelta, AssistantTextFinished, CreatorEventSink


@dataclass(frozen=True, slots=True)
class DeepAgentCompleted:
    state: dict[str, Any] | None


@dataclass(frozen=True, slots=True)
class DeepAgentInterrupted:
    interrupts: tuple[dict[str, Any], ...]


def _project_interrupt(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return {"id": str(value.get("id", "")), "value": value.get("value")}
    payload = getattr(value, "value", None)
    return {
        "id": str(getattr(value, "id", "")),
        "value": payload,
    }


async def _consume_model_text(messages: Any, event_sink: CreatorEventSink | None) -> None:
    # Consume only the public text projection: reasoning and tool arguments
    # are separate content channels and must not appear as assistant prose.
    async for message in messages:
        message_id = f"creator-text-{uuid4()}"
        started = False
        async for delta in message.text:
            if not delta or event_sink is None:
                continue
            if not started:
                await event_sink.publish(AssistantTextStarted(message_id))
                started = True
            await event_sink.publish(AssistantTextDelta(message_id, delta))
        if started:
            await event_sink.publish(AssistantTextFinished(message_id))


class DeepAgentV3Runner:
    """Own the experimental DeepAgents/LangGraph v3 streaming surface."""

    async def run(
        self,
        *,
        graph: Any,
        input: Any,
        config: dict[str, Any],
        event_sink: CreatorEventSink | None,
    ) -> dict[str, Any] | None:
        try:
            # DeepAgents registers tool-call projections on the compiled graph.
            # Call-site transformers are additive and must not register them again.
            stream = await graph.astream_events(
                input,
                config=config,
                version="v3",
            )
        except (AttributeError, TypeError) as error:
            raise DeepAgentEventStreamUnavailableError(
                "DeepAgents v3 event stream is unavailable."
            ) from error

        if not all(hasattr(stream, name) for name in ("tool_calls", "output", "abort")):
            abort = getattr(stream, "abort", None)
            if callable(abort):
                await abort()
            raise DeepAgentEventStreamUnavailableError(
                "DeepAgents v3 event stream is missing required projections."
            )

        adapter = DeepAgentToolStreamAdapter(event_sink)
        # StreamChannel drops local projection items until it has a subscriber.
        # Acquire the official cursor before the output projection starts pumping.
        tool_cursor = stream.tool_calls.__aiter__()
        tool_task = asyncio.create_task(adapter.consume_all(tool_cursor))
        # Subscribe before output starts pumping so early model rounds are kept.
        messages = getattr(stream, "messages", None)
        text_task = asyncio.create_task(_consume_model_text(messages.__aiter__(), event_sink)) if messages is not None else None
        output_task = asyncio.create_task(stream.output())
        tasks = (tool_task, output_task) if text_task is None else (tool_task, text_task, output_task)
        try:
            await asyncio.gather(*tasks)
            state = output_task.result()
            return state if isinstance(state, dict) or state is None else dict(state)
        except BaseException:
            for task in tasks:
                if not task.done():
                    task.cancel()
            await stream.abort()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise
        finally:
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    async def run_result(
        self,
        *,
        graph: Any,
        input: Any,
        config: dict[str, Any],
        event_sink: CreatorEventSink | None,
    ) -> DeepAgentCompleted | DeepAgentInterrupted:
        state = await self.run(graph=graph, input=input, config=config, event_sink=event_sink)
        raw = state.get("__interrupt__", ()) if isinstance(state, dict) else ()
        if not raw and getattr(graph, "checkpointer", None) is not None and callable(getattr(graph, "aget_state", None)):
            snapshot = await graph.aget_state(config)
            raw = tuple(
                interrupt
                for task in getattr(snapshot, "tasks", ())
                for interrupt in getattr(task, "interrupts", ())
            )
        if raw:
            return DeepAgentInterrupted(tuple(_project_interrupt(item) for item in raw))
        return DeepAgentCompleted(state)
