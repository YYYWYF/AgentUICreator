from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol, TypeAlias


@dataclass(frozen=True, slots=True)
class ToolInvocationStarted:
    call_id: str
    name: str
    arguments: dict[str, Any]


@dataclass(frozen=True, slots=True)
class ToolInvocationFinished:
    call_id: str
    result: str
    status: str


CreatorRuntimeEvent: TypeAlias = ToolInvocationStarted | ToolInvocationFinished


class CreatorEventSink(Protocol):
    @property
    def cancel_requested(self) -> bool: ...

    async def publish(self, event: CreatorRuntimeEvent) -> None: ...

    def publish_nowait(self, event: CreatorRuntimeEvent) -> None: ...
