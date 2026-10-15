from __future__ import annotations

import asyncio
from types import SimpleNamespace

from agent_ui_creator.streaming import (
    CreatorEventBus,
    DeepAgentToolStreamAdapter,
    ToolInvocationFinished,
    ToolInvocationStarted,
)


class _CompletedToolCall:
    def __init__(self, call_id: str) -> None:
        self.tool_call_id = call_id
        self.tool_name = "inspect_ui_project"
        self.input = {"detail": "summary"}
        self.output = SimpleNamespace(content="done", status="success")
        self.error = None
        self.completed = True

    async def _deltas(self):
        if False:
            yield None

    @property
    def output_deltas(self):
        return self._deltas()


def test_adapter_uses_authoritative_id_and_deduplicates_presentation_events():
    async def scenario() -> None:
        bus = CreatorEventBus()
        adapter = DeepAgentToolStreamAdapter(bus)

        await adapter.consume(_CompletedToolCall("call-1"))
        await adapter.consume(_CompletedToolCall("call-1"))

        started = await bus.next_event()
        finished = await bus.next_event()
        assert isinstance(started, ToolInvocationStarted)
        assert isinstance(finished, ToolInvocationFinished)
        assert started.call_id == finished.call_id == "call-1"
        assert bus.metrics().tool_events_published == 4

    asyncio.run(scenario())
