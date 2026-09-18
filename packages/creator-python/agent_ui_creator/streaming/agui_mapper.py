from __future__ import annotations

import json
from collections.abc import Callable
from uuid import uuid4

from ag_ui.core import (
    BaseEvent,
    EventType,
    StepFinishedEvent,
    StepStartedEvent,
    ToolCallArgsEvent,
    ToolCallEndEvent,
    ToolCallResultEvent,
    ToolCallStartEvent,
)

from .runtime_events import (
    CreatorRuntimeEvent,
    CreatorStepFinished,
    CreatorStepStarted,
    ToolInvocationFinished,
    ToolInvocationStarted,
)


def map_runtime_event(
    event: CreatorRuntimeEvent,
    *,
    message_id_factory: Callable[[], str] = lambda: str(uuid4()),
) -> tuple[BaseEvent, ...]:
    if isinstance(event, ToolInvocationStarted):
        return (
            ToolCallStartEvent(
                type=EventType.TOOL_CALL_START,
                tool_call_id=event.call_id,
                tool_call_name=event.name,
            ),
            ToolCallArgsEvent(
                type=EventType.TOOL_CALL_ARGS,
                tool_call_id=event.call_id,
                delta=json.dumps(
                    event.arguments,
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
            ),
            ToolCallEndEvent(
                type=EventType.TOOL_CALL_END,
                tool_call_id=event.call_id,
            ),
        )
    if isinstance(event, ToolInvocationFinished):
        return (
            ToolCallResultEvent(
                type=EventType.TOOL_CALL_RESULT,
                message_id=message_id_factory(),
                tool_call_id=event.call_id,
                content=event.result,
                role="tool",
            ),
        )
    if isinstance(event, CreatorStepStarted):
        return (
            StepStartedEvent(
                type=EventType.STEP_STARTED,
                step_name=event.name,
                **(
                    {"metadata": event.metadata}
                    if event.metadata is not None
                    else {}
                ),
            ),
        )
    if isinstance(event, CreatorStepFinished):
        return (
            StepFinishedEvent(
                type=EventType.STEP_FINISHED,
                step_name=event.name,
                **(
                    {"metadata": event.metadata}
                    if event.metadata is not None
                    else {}
                ),
            ),
        )
    raise TypeError(f"Unsupported Creator runtime event: {type(event).__name__}")
