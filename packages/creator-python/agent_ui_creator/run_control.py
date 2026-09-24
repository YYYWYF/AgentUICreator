from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Literal, Mapping


CompletionStatus = Literal["success", "already_satisfied", "blocked", "failed"]
RunStatus = Literal["running", "blocked"]


@dataclass(frozen=True, slots=True)
class TerminalBlocker:
    category: str
    code: str
    source: str
    message: str
    details: dict[str, Any]
    recovery: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class TerminalBlockerStop(RuntimeError):
    """Internal control-flow signal for a normal, blocked run completion."""

    code = "CREATOR_RUN_BLOCKED"

    def __init__(self, blocker: TerminalBlocker):
        self.blocker = blocker
        super().__init__(blocker.message)


def _copy_mapping(value: Mapping[str, Any] | None) -> dict[str, Any]:
    return {} if value is None else {str(key): item for key, item in value.items()}


class CreatorRunControlState:
    """Host-owned, run-scoped execution state for terminal blockers."""

    def __init__(self) -> None:
        self.status: RunStatus = "running"
        self.terminal_blocker: TerminalBlocker | None = None
        self._model_calls = 0
        self._tool_calls = 0
        self._terminal_blocker_at_model_call: int | None = None
        self._terminal_blocker_at_tool_call: int | None = None
        self._model_calls_after_terminal_blocker = 0
        self._tool_calls_after_terminal_blocker = 0

    @property
    def blocked(self) -> bool:
        return self.status == "blocked"

    def observe_protocol_counts(self, *, model_calls: int, tool_calls: int) -> None:
        """Synchronize counters with protocol metrics without owning them."""

        model_calls = max(0, int(model_calls))
        tool_calls = max(0, int(tool_calls))
        if self.blocked:
            model_at_block = self._terminal_blocker_at_model_call or 0
            tool_at_block = self._terminal_blocker_at_tool_call or 0
            self._model_calls_after_terminal_blocker = max(
                self._model_calls_after_terminal_blocker,
                model_calls - model_at_block,
            )
            self._tool_calls_after_terminal_blocker = max(
                self._tool_calls_after_terminal_blocker,
                tool_calls - tool_at_block,
            )
            return
        self._model_calls = model_calls
        self._tool_calls = tool_calls

    def block(
        self,
        *,
        category: str,
        code: str,
        source: str,
        message: str,
        details: Mapping[str, Any] | None = None,
        recovery: Mapping[str, Any] | None = None,
        model_call: int | None = None,
        tool_call: int | None = None,
    ) -> bool:
        """Record the first terminal blocker; later observations cannot replace it."""

        if self.terminal_blocker is not None:
            return False
        normalized_recovery = _copy_mapping(recovery)
        if not normalized_recovery:
            normalized_recovery = {
                "action": "stop_and_report_blocker",
                "automaticRepairAllowed": False,
            }
        self.terminal_blocker = TerminalBlocker(
            category=str(category),
            code=str(code),
            source=str(source),
            message=str(message).strip()
            or "Creator 环境发现了工作区完整性问题。",
            details=_copy_mapping(details),
            recovery=normalized_recovery,
        )
        self.status = "blocked"
        self._terminal_blocker_at_model_call = max(
            0, self._model_calls if model_call is None else int(model_call)
        )
        self._terminal_blocker_at_tool_call = max(
            0, self._tool_calls if tool_call is None else int(tool_call)
        )
        return True

    def assert_runnable(self) -> None:
        if self.terminal_blocker is not None:
            raise TerminalBlockerStop(self.terminal_blocker)

    def assert_tool_runnable(self) -> None:
        if self.terminal_blocker is not None:
            self._tool_calls_after_terminal_blocker += 1
            raise TerminalBlockerStop(self.terminal_blocker)

    def render_blocker_response(self) -> str:
        blocker = self.terminal_blocker
        if blocker is None:
            raise RuntimeError("Cannot render a missing terminal blocker.")
        return (
            "本次修改未完成：当前项目存在工作区完整性问题。\n"
            f"原因：{blocker.message}\n"
            "本轮没有跨越任务范围自动修改相关源码。"
        )

    def blocker_dict(self) -> dict[str, Any] | None:
        return None if self.terminal_blocker is None else self.terminal_blocker.to_dict()

    def metrics(self) -> dict[str, Any]:
        blocker = self.terminal_blocker
        return {
            "terminalBlockerCount": int(blocker is not None),
            "terminalBlockerCode": None if blocker is None else blocker.code,
            "terminalBlockerSource": None if blocker is None else blocker.source,
            "terminalBlockerAtModelCall": self._terminal_blocker_at_model_call,
            "modelCallsAfterTerminalBlocker": self._model_calls_after_terminal_blocker,
            "toolCallsAfterTerminalBlocker": self._tool_calls_after_terminal_blocker,
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "terminalBlocker": self.blocker_dict(),
            **self.metrics(),
        }
