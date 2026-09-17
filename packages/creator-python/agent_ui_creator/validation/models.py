from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from ..service_contracts.verification import ServiceContractHostCheck
from .diagnostics import TypeScriptDiagnostic


CREATOR_COMPLETION_VALIDATIONS = (
    "pnpm verify:ui",
    "pnpm typecheck",
)
CreatorValidationCommand = Literal["pnpm verify:ui", "pnpm typecheck"]
ValidationMode = Literal["delta", "clean"]
DifferentialStatus = Literal["available", "unavailable"]


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
class TypecheckDifferential:
    mode: ValidationMode
    status: DifferentialStatus
    baseline_captured: bool
    baseline_available: bool
    current_available: bool
    baseline_diagnostics: tuple[TypeScriptDiagnostic, ...] = ()
    current_diagnostics: tuple[TypeScriptDiagnostic, ...] = ()
    new_diagnostics: tuple[TypeScriptDiagnostic, ...] = ()
    unchanged_diagnostics: tuple[TypeScriptDiagnostic, ...] = ()
    resolved_diagnostics: tuple[TypeScriptDiagnostic, ...] = ()
    reason: str | None = None

    @staticmethod
    def _samples(
        diagnostics: tuple[TypeScriptDiagnostic, ...],
    ) -> list[dict[str, str]]:
        return [diagnostic.to_dict() for diagnostic in diagnostics[:8]]

    def to_dict(self) -> dict[str, object]:
        available = self.status == "available"
        return {
            "validationMode": self.mode,
            "differentialStatus": self.status,
            "validationBaselineCaptured": self.baseline_captured,
            "baselineAvailable": self.baseline_available,
            "baselineDiagnosticCount": (
                len(self.baseline_diagnostics) if self.baseline_available else None
            ),
            "currentDiagnosticCount": (
                len(self.current_diagnostics) if self.current_available else None
            ),
            "newDiagnosticCount": len(self.new_diagnostics) if available else None,
            "unchangedDiagnosticCount": (
                len(self.unchanged_diagnostics) if available else None
            ),
            "resolvedDiagnosticCount": (
                len(self.resolved_diagnostics) if available else None
            ),
            "newDiagnostics": self._samples(self.new_diagnostics),
            "unchangedDiagnostics": self._samples(self.unchanged_diagnostics),
            "resolvedDiagnostics": self._samples(self.resolved_diagnostics),
            "currentDiagnostics": self._samples(self.current_diagnostics),
            **({"reason": self.reason} if self.reason is not None else {}),
        }


@dataclass(frozen=True, slots=True)
class ValidationEvidence:
    revision: int
    status: Literal["passed", "failed", "stale"]
    checks: tuple[CreatorValidationCheck, ...]
    host_checks: tuple[ServiceContractHostCheck, ...] = ()
    differential: TypecheckDifferential | None = None
    workspace_warning: dict[str, object] | None = None

    def to_dict(self) -> dict[str, object]:
        differential = self.differential
        return {
            "revision": self.revision,
            "status": self.status,
            "checks": [check.to_dict() for check in self.checks],
            "hostChecks": [check.to_dict() for check in self.host_checks],
            **(differential.to_dict() if differential is not None else {}),
            "workspaceWarning": self.workspace_warning,
        }


@dataclass(frozen=True, slots=True)
class CreatorValidationResult:
    evidence: ValidationEvidence
    failure_semantics: dict[str, Any] | None = None

    @property
    def revision(self) -> int:
        return self.evidence.revision

    @property
    def status(self) -> Literal["passed", "failed", "stale"]:
        return self.evidence.status

    @property
    def checks(self) -> tuple[CreatorValidationCheck, ...]:
        return self.evidence.checks

    @property
    def host_checks(self) -> tuple[ServiceContractHostCheck, ...]:
        return self.evidence.host_checks

    @property
    def differential(self) -> TypecheckDifferential | None:
        return self.evidence.differential

    @property
    def workspace_warning(self) -> dict[str, object] | None:
        return self.evidence.workspace_warning

    def to_dict(self) -> dict[str, object]:
        return {
            **self.evidence.to_dict(),
            **(
                {"failureSemantics": dict(self.failure_semantics)}
                if self.failure_semantics is not None
                else {}
            ),
        }
