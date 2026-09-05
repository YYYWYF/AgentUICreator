from __future__ import annotations

import asyncio
from dataclasses import dataclass
from time import monotonic
from typing import AsyncIterator

from .runtime_events import (
    CreatorRuntimeEvent,
    ToolInvocationFinished,
    ToolInvocationStarted,
)


class CreatorEventStreamBackpressureError(RuntimeError):
    code = "CREATOR_EVENT_STREAM_BACKPRESSURE"


@dataclass(frozen=True, slots=True)
class CreatorEventStreamMetrics:
    tool_events_published: int
    first_tool_event_ms: int | None
    last_tool_event_ms: int | None

    def to_dict(self) -> dict[str, int | None]:
        return {
            "toolEventsPublished": self.tool_events_published,
            "firstToolEventMs": self.first_tool_event_ms,
            "lastToolEventMs": self.last_tool_event_ms,
        }


class CreatorEventBus:
    """Run-scoped bounded FIFO for intermediate Creator runtime events."""

    def __init__(self, *, maxsize: int = 256) -> None:
        if maxsize < 1:
            raise ValueError("Creator event stream maxsize must be positive.")
        self._queue: asyncio.Queue[CreatorRuntimeEvent] = asyncio.Queue(
            maxsize=maxsize
        )
        self._closed = asyncio.Event()
        self._cancel_requested = False
        self._active_tool_calls: set[str] = set()
        self._started_at = monotonic()
        self._tool_events_published = 0
        self._first_tool_event_ms: int | None = None
        self._last_tool_event_ms: int | None = None

    @property
    def cancel_requested(self) -> bool:
        return self._cancel_requested

    @property
    def has_active_tools(self) -> bool:
        return bool(self._active_tool_calls)

    @property
    def closed(self) -> bool:
        return self._closed.is_set()

    def request_cancel(self) -> None:
        self._cancel_requested = True

    def close(self) -> None:
        self._closed.set()

    async def publish(self, event: CreatorRuntimeEvent) -> None:
        self._assert_open()
        await self._queue.put(event)
        self._record_publish(event)

    def publish_nowait(self, event: CreatorRuntimeEvent) -> None:
        self._assert_open()
        try:
            self._queue.put_nowait(event)
        except asyncio.QueueFull as error:
            raise CreatorEventStreamBackpressureError(
                "Creator event stream reached its bounded capacity."
            ) from error
        self._record_publish(event)

    async def next_event(self) -> CreatorRuntimeEvent | None:
        while True:
            if not self._queue.empty():
                return self._queue.get_nowait()
            if self._closed.is_set():
                return None

            queue_task = asyncio.create_task(self._queue.get())
            closed_task = asyncio.create_task(self._closed.wait())
            done, pending = await asyncio.wait(
                (queue_task, closed_task),
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
            if pending:
                await asyncio.gather(*pending, return_exceptions=True)
            if queue_task in done:
                return queue_task.result()

    async def events(self) -> AsyncIterator[CreatorRuntimeEvent]:
        while True:
            event = await self.next_event()
            if event is None:
                return
            yield event

    def metrics(self) -> CreatorEventStreamMetrics:
        return CreatorEventStreamMetrics(
            tool_events_published=self._tool_events_published,
            first_tool_event_ms=self._first_tool_event_ms,
            last_tool_event_ms=self._last_tool_event_ms,
        )

    def _assert_open(self) -> None:
        if self._closed.is_set():
            raise RuntimeError("Creator event stream is already closed.")

    def _record_publish(self, event: CreatorRuntimeEvent) -> None:
        if isinstance(event, ToolInvocationStarted):
            self._active_tool_calls.add(event.call_id)
            emitted_events = 3
        elif isinstance(event, ToolInvocationFinished):
            self._active_tool_calls.discard(event.call_id)
            emitted_events = 1
        else:
            emitted_events = 0
        if emitted_events == 0:
            return
        elapsed_ms = max(0, int((monotonic() - self._started_at) * 1000))
        self._tool_events_published += emitted_events
        if self._first_tool_event_ms is None:
            self._first_tool_event_ms = elapsed_ms
        self._last_tool_event_ms = elapsed_ms
