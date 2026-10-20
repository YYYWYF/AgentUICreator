from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest
from deepagents import create_deep_agent
from langchain_core.callbacks import BaseCallbackHandler, CallbackManager
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage
from langchain_core.tools import tool
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command, interrupt

from agent_ui_creator.human_input import ask_user_question
from agent_ui_creator.streaming import (
    CreatorEventBus,
    DeepAgentToolStreamAdapter,
    DeepAgentV3Runner,
    ToolInvocationFinished,
    ToolInvocationStarted,
)
from agent_ui_creator.streaming.deepagent_v3_runner import DeepAgentCompleted, DeepAgentInterrupted


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


def test_user_cancellation_does_not_publish_a_failed_tool_result():
    async def scenario():
        bus = CreatorEventBus()
        adapter = DeepAgentToolStreamAdapter(bus)
        call = _CompletedToolCall("cancelled")
        call.completed = False
        adapter.on_tool_error(asyncio.CancelledError(), run_id="runtime", tool_call_id="cancelled")
        await adapter.consume(call)
        bus.close()
        events = [event async for event in bus.events()]
        assert any(isinstance(event, ToolInvocationStarted) for event in events)
        assert not any(isinstance(event, ToolInvocationFinished) for event in events)
    asyncio.run(scenario())


@pytest.mark.parametrize("name", ["ask_user_question", "inspect_ui_project"])
@pytest.mark.parametrize("error", ["real failure", "(Interrupt(value={'kind': 'ask_user_question'}),)"])
def test_adapter_preserves_errors_even_if_their_text_looks_like_interrupts(name, error):
    async def scenario():
        bus = CreatorEventBus()
        call = _CompletedToolCall("failed-1")
        call.tool_name = name
        call.error = error
        await DeepAgentToolStreamAdapter(bus).consume(call)
        bus.close()
        results = [event async for event in bus.events() if isinstance(event, ToolInvocationFinished)]
        assert len(results) == 1
        assert results[0].status == "error"
        assert results[0].result == error

    asyncio.run(scenario())


@pytest.mark.parametrize("callback_manager", [False, True])
def test_real_non_question_interrupt_preserves_existing_callbacks(callback_manager):
    class ToolCallingModel(FakeMessagesListChatModel):
        def bind_tools(self, tools, **kwargs):
            return self

    class Observer(BaseCallbackHandler):
        run_inline = True

        def __init__(self):
            self.errors = []

        def on_tool_error(self, error, **kwargs):
            self.errors.append(error)

    @tool
    def confirmation() -> str:
        """Pause for confirmation."""
        return interrupt({"kind": "confirmation"})

    async def scenario():
        observer = Observer()
        callbacks = CallbackManager.configure(inheritable_callbacks=[observer]) if callback_manager else [observer]
        config = {"configurable": {"thread_id": "confirmation"}, "callbacks": callbacks}
        graph = create_deep_agent(
            model=ToolCallingModel(responses=[
                AIMessage(content="", tool_calls=[{"name": "confirmation", "args": {}, "id": "confirm-1"}]),
                AIMessage(content="Done."),
            ]), tools=[confirmation], checkpointer=InMemorySaver(), subagents=[],
        )
        bus = CreatorEventBus()
        runner = DeepAgentV3Runner()
        paused = await runner.run_result(
            graph=graph, input={"messages": [{"role": "user", "content": "Confirm"}]},
            config=config, event_sink=bus,
        )
        assert isinstance(paused, DeepAgentInterrupted)
        bus.close()
        events = [event async for event in bus.events()]
        assert not any(isinstance(event, ToolInvocationFinished) for event in events)
        assert len(observer.errors) == 1
        assert config["callbacks"] is callbacks
        assert (callbacks.handlers if callback_manager else callbacks) == [observer]

        resumed_bus = CreatorEventBus()
        completed = await runner.run_result(
            graph=graph, input=Command(resume="approved"), config=config, event_sink=resumed_bus,
        )
        assert isinstance(completed, DeepAgentCompleted)
        resumed_bus.close()
        results = [event async for event in resumed_bus.events() if isinstance(event, ToolInvocationFinished)]
        assert results == [ToolInvocationFinished(call_id="confirm-1", result="approved", status="success")]

    asyncio.run(scenario())


def test_real_question_interrupt_has_no_failure_result_and_resumes_with_same_call_id():
    class ToolCallingModel(FakeMessagesListChatModel):
        def bind_tools(self, tools, **kwargs):
            return self

    async def scenario():
        question = {"steps": [{
            "id": "removal", "question": "Remove?", "selectionMode": "single",
            "minSelections": 1, "maxSelections": 1,
            "options": [{"id": "hide", "label": "Hide"}, {"id": "purge", "label": "Delete"}],
        }]}
        graph = create_deep_agent(
            model=ToolCallingModel(responses=[
                AIMessage(content="", tool_calls=[{"name": "ask_user_question", "args": question, "id": "ask-1"}]),
                AIMessage(content="Done."),
            ]),
            tools=[ask_user_question], checkpointer=InMemorySaver(), subagents=[],
        )
        config = {"configurable": {"thread_id": "question-stream"}}
        runner = DeepAgentV3Runner()
        paused_bus = CreatorEventBus()
        paused = await runner.run_result(
            graph=graph, input={"messages": [{"role": "user", "content": "Remove"}]},
            config=config, event_sink=paused_bus,
        )
        assert isinstance(paused, DeepAgentInterrupted)
        assert paused.interrupts[0]["value"]["kind"] == "ask_user_question"
        paused_bus.close()
        events = [event async for event in paused_bus.events()]
        assert [event.call_id for event in events if isinstance(event, ToolInvocationStarted)] == ["ask-1"]
        assert not any(isinstance(event, ToolInvocationFinished) for event in events)

        resumed_bus = CreatorEventBus()
        completed = await runner.run_result(
            graph=graph, input=Command(resume={"answers": {"removal": ["hide"]}}),
            config=config, event_sink=resumed_bus,
        )
        assert isinstance(completed, DeepAgentCompleted)
        resumed_bus.close()
        results = [event async for event in resumed_bus.events() if isinstance(event, ToolInvocationFinished)]
        assert len(results) == 1
        assert results[0].call_id == "ask-1"
        assert results[0].status == "success"
        assert json.loads(results[0].result) == {"answers": {"removal": ["hide"]}}

    asyncio.run(scenario())
