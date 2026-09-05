from __future__ import annotations

import asyncio
from typing import Any

from ..model_protocol.errors import DeepAgentEventStreamUnavailableError
from .deepagent_tool_stream import DeepAgentToolStreamAdapter
from .runtime_events import CreatorEventSink


class DeepAgentV3Runner:
    """Own the experimental DeepAgents/LangGraph v3 streaming surface."""

    async def run(
        self,
        *,
        graph: Any,
        input: dict[str, Any],
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
        output_task = asyncio.create_task(stream.output())
        tasks = (tool_task, output_task)
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
