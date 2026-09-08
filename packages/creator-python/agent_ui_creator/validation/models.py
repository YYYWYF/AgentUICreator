from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


CREATOR_COMPLETION_VALIDATIONS = (
    "pnpm verify:ui",
    "pnpm typecheck",
)
CreatorValidationCommand = Literal["pnpm verify:ui", "pnpm typecheck"]


@dataclass(frozen=True, slots=True)
class CommandExecutionResult:
    output: str
    exit_code: int | None
    truncated: bool


@dataclass(frozen=True, slots=True)
class CreatorValidationCheck:
    command: str
    status: Literal["passed", "failed"]
    exit_code: int | None
    output: str
    truncated: bool
    revision: int
    source: Literal["cached", "executed"]

    def to_dict(self) -> dict[str, object]:
        return {
            "command": self.command,
            "status": self.status,
            "exitCode": self.exit_code,
            "output": self.output,
            "truncated": self.truncated,
            "revision": self.revision,
            "source": self.source,
        }


@dataclass(frozen=True, slots=True)
class CreatorValidationResult:
    revision: int
    status: Literal["passed", "failed", "stale"]
    checks: tuple[CreatorValidationCheck, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "revision": self.revision,
            "status": self.status,
            "checks": [check.to_dict() for check in self.checks],
        }
