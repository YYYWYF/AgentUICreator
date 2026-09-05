from __future__ import annotations

import asyncio

import pytest
from deepagents import create_deep_agent
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.tools import tool

from agent_ui_creator.minimal_agent.path_policy import (
    MinimalAgentPathPolicy,
    PolicyFilesystemBackend,
)
from agent_ui_creator.minimal_agent.runtime_guard import MinimalAgentRuntimeGuard
from agent_ui_creator.model_protocol.errors import ModelToolProtocolError
from agent_ui_creator.streaming import (
    CreatorEventBus,
    DeepAgentV3Runner,
    ToolInvocationFinished,
    ToolInvocationStarted,
)


class _ToolCallingFakeModel(FakeMessagesListChatModel):
    def bind_tools(self, tools, **kwargs):
        return self


def test_real_deepagent_stream_emits_start_before_slow_tool_finishes(tmp_path):
    async def scenario() -> None:
        allow_tool_finish = asyncio.Event()
        tool_handler_finished = asyncio.Event()

        @tool
        async def slow_test_tool() -> str:
            """Wait for the streaming assertion before returning."""
            await allow_tool_finish.wait()
            tool_handler_finished.set()
            return "done"

        model = _ToolCallingFakeModel(
            responses=[
                AIMessage(
                    content="",
                    tool_calls=[
                        {"name": "slow_test_tool", "args": {}, "id": "call-stream-1"}
                    ],
                ),
                AIMessage(content="Finished."),
            ]
        )
        backend = PolicyFilesystemBackend(
            tmp_path, MinimalAgentPathPolicy.conformance()
        )
        runtime = MinimalAgentRuntimeGuard(backend)
        graph = create_deep_agent(
            model=model,
            tools=[slow_test_tool],
            backend=backend,
            subagents=[],
            middleware=[runtime],
        )
        bus = CreatorEventBus()
        run_task = asyncio.create_task(
            DeepAgentV3Runner().run(
                graph=graph,
                input={"messages": [{"role": "user", "content": "Run the slow tool."}]},
                config={"recursion_limit": 30},
                event_sink=bus,
            )
        )

        started = await asyncio.wait_for(bus.next_event(), timeout=1)
        assert isinstance(started, ToolInvocationStarted)
        assert started.call_id == "call-stream-1"
        assert not allow_tool_finish.is_set()
        assert not tool_handler_finished.is_set()

        allow_tool_finish.set()
        state = await asyncio.wait_for(run_task, timeout=2)
        finished = await asyncio.wait_for(bus.next_event(), timeout=1)
        assert isinstance(finished, ToolInvocationFinished)
        assert finished.call_id == started.call_id
        assert finished.result == "done"
        assert runtime.activities[0].callId == started.call_id
        assert any(
            isinstance(message, ToolMessage)
            and message.tool_call_id == started.call_id
            for message in state["messages"]
        )

    asyncio.run(scenario())


def test_runner_aborts_output_when_tool_projection_fails():
    class BrokenToolCall:
        tool_call_id = ""
        tool_name = "broken"
        input = {}

    class BrokenStream:
        def __init__(self) -> None:
            self.aborted = False

        async def _tool_calls(self):
            yield BrokenToolCall()

        @property
        def tool_calls(self):
            return self._tool_calls()

        async def output(self):
            await asyncio.Event().wait()

        async def abort(self):
            self.aborted = True

    class BrokenGraph:
        def __init__(self, stream) -> None:
            self.stream = stream

        async def astream_events(self, *args, **kwargs):
            return self.stream

    async def scenario() -> None:
        stream = BrokenStream()
        with pytest.raises(ModelToolProtocolError):
            await DeepAgentV3Runner().run(
                graph=BrokenGraph(stream),
                input={"messages": []},
                config={},
                event_sink=CreatorEventBus(),
            )
        assert stream.aborted is True

    asyncio.run(scenario())
