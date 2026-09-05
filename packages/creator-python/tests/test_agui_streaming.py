import asyncio
import json
from types import SimpleNamespace

import pytest
from ag_ui.core import EventType, ToolCallResultEvent
from ag_ui.encoder import EventEncoder

from agent_ui_creator.minimal_agent.path_policy import (
    MinimalAgentPathPolicy,
    PolicyFilesystemBackend,
)
from agent_ui_creator.minimal_agent.runtime_guard import MinimalAgentRuntimeGuard
from agent_ui_creator.model_protocol.errors import ModelToolProtocolError
from agent_ui_creator.streaming import (
    CreatorEventBus,
    CreatorEventStreamBackpressureError,
    ToolInvocationFinished,
    ToolInvocationStarted,
    map_runtime_event,
)


def test_mapper_uses_official_tool_events_and_encoder_camel_case():
    started = ToolInvocationStarted(
        call_id="call-1",
        name="inspect_ui_project",
        arguments={"foo": "bar"},
    )
    events = map_runtime_event(started)

    assert [event.type for event in events] == [
        EventType.TOOL_CALL_START,
        EventType.TOOL_CALL_ARGS,
        EventType.TOOL_CALL_END,
    ]
    assert json.loads(events[1].delta) == {"foo": "bar"}
    encoded = EventEncoder().encode(events[0])
    assert '"toolCallId":"call-1"' in encoded
    assert '"toolCallName":"inspect_ui_project"' in encoded


def test_mapper_creates_unique_official_tool_result_messages():
    finished = ToolInvocationFinished("call-1", "ok", "success")
    first = map_runtime_event(finished, message_id_factory=lambda: "result-1")[0]
    second = map_runtime_event(finished, message_id_factory=lambda: "result-2")[0]

    assert isinstance(first, ToolCallResultEvent)
    assert first.tool_call_id == second.tool_call_id == "call-1"
    assert first.message_id == "result-1"
    assert second.message_id == "result-2"
    assert first.role == "tool"
    assert first.content == "ok"


def test_event_bus_is_bounded_fifo():
    async def scenario() -> None:
        bus = CreatorEventBus(maxsize=1)
        first = ToolInvocationStarted("call-1", "read_file", {})
        bus.publish_nowait(first)
        with pytest.raises(CreatorEventStreamBackpressureError):
            bus.publish_nowait(ToolInvocationFinished("call-1", "ok", "success"))
        assert await bus.next_event() == first
        bus.close()
        assert await bus.next_event() is None

    asyncio.run(scenario())


def test_runtime_guard_rejects_missing_tool_call_id_before_handler(tmp_path):
    bus = CreatorEventBus()
    guard = MinimalAgentRuntimeGuard(
        PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.conformance()),
        event_sink=bus,
    )
    handler_called = False

    def handler(_request):
        nonlocal handler_called
        handler_called = True

    request = SimpleNamespace(tool_call={"name": "read_file", "args": {}})
    with pytest.raises(ModelToolProtocolError):
        guard.wrap_tool_call(request, handler)
    assert handler_called is False


def test_runtime_guard_records_delayed_handler_without_publishing_ui_events(tmp_path):
    async def scenario() -> None:
        bus = CreatorEventBus()
        guard = MinimalAgentRuntimeGuard(
            PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.conformance()),
            event_sink=bus,
        )
        handler_started = asyncio.Event()
        allow_finish = asyncio.Event()

        async def handler(_request):
            handler_started.set()
            await allow_finish.wait()
            return SimpleNamespace(content="done", status="success")

        request = SimpleNamespace(
            tool_call={"name": "read_file", "args": {"file_path": "/a"}, "id": "call-1"}
        )
        task = asyncio.create_task(guard.awrap_tool_call(request, handler))
        await asyncio.wait_for(handler_started.wait(), timeout=0.5)
        assert handler_started.is_set()
        assert not task.done()
        allow_finish.set()
        await task
        assert bus.metrics().tool_events_published == 0
        assert guard.activities[0].callId == "call-1"
        assert guard.activities[0].result == "done"

    asyncio.run(scenario())


def test_runtime_guard_records_error_without_publishing_ui_events(tmp_path):
    async def scenario() -> None:
        bus = CreatorEventBus()
        guard = MinimalAgentRuntimeGuard(
            PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.conformance()),
            event_sink=bus,
        )

        async def handler(_request):
            raise RuntimeError("tool failed")

        request = SimpleNamespace(
            tool_call={"name": "read_file", "args": {}, "id": "call-error"}
        )
        with pytest.raises(RuntimeError, match="tool failed"):
            await guard.awrap_tool_call(request, handler)
        assert bus.metrics().tool_events_published == 0
        assert guard.activities[0].callId == "call-error"
        assert guard.activities[0].status == "error"
        assert guard.activities[0].result == "tool failed"

    asyncio.run(scenario())


def test_cancel_request_waits_for_active_tool_result_then_stops(tmp_path):
    async def scenario() -> None:
        bus = CreatorEventBus()
        guard = MinimalAgentRuntimeGuard(
            PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.conformance()),
            event_sink=bus,
        )
        allow_finish = asyncio.Event()
        handler_started = asyncio.Event()
        handler_finished = asyncio.Event()

        async def handler(_request):
            handler_started.set()
            await allow_finish.wait()
            handler_finished.set()
            return SimpleNamespace(content="committed", status="success")

        request = SimpleNamespace(
            tool_call={"name": "edit_file", "args": {}, "id": "call-write"}
        )
        task = asyncio.create_task(guard.awrap_tool_call(request, handler))
        await asyncio.wait_for(handler_started.wait(), timeout=0.5)
        bus.request_cancel()
        assert not task.done()
        allow_finish.set()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert handler_finished.is_set()
        assert bus.metrics().tool_events_published == 0
        assert guard.activities[0].result == "committed"

    asyncio.run(scenario())
