from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Protocol

from ..activity import CreatorActivityRecorder
from ..repair import CreatorRepairState
from ..service_contracts.verification import ServiceContractAuthorizationVerifier
from . import attribution
from .command_runner import CreatorValidationCommandRunner
from .diagnostics import (
    TypeScriptDiagnostic,
    TypeScriptDiagnosticParseResult,
    parse_typescript_diagnostics,
)
from .models import (
    CREATOR_COMPLETION_VALIDATIONS,
    CommandExecutionResult,
    CreatorValidationCheck,
    CreatorValidationCommand,
    CreatorValidationResult,
    TypecheckDifferential,
    ValidationMode,
    ValidationEvidence,
)

if TYPE_CHECKING:
    from ..domain_agent.change_scope import ChangeScopeMetrics


MAX_VALIDATION_FAILURE_OUTPUT_CHARACTERS = 12_000
MAX_DIAGNOSTIC_SAMPLE_COUNT = 8


class ValidationCommandRunner(Protocol):
    async def execute_known_command(
        self, command: CreatorValidationCommand
    ) -> CommandExecutionResult: ...


class CreatorValidationService:
    def __init__(
        self,
        *,
        project_root: str | Path,
        activity: CreatorActivityRecorder,
        runner: ValidationCommandRunner | None = None,
        repair_state: CreatorRepairState | None = None,
        host_verifier: ServiceContractAuthorizationVerifier | None = None,
        scope: ChangeScopeMetrics | None = None,
    ) -> None:
        self.project_root = Path(project_root).resolve()
        self.activity = activity
        self.runner = runner or CreatorValidationCommandRunner(project_root)
        self.repair_state = repair_state or CreatorRepairState()
        self.latest_evidence: ValidationEvidence | None = None
        self.latest_result: CreatorValidationResult | None = None
        self.host_verifier = host_verifier
        self.scope = scope
        self._baseline_run_id: str | None = None
        self._baseline_capture_started = False
        self._baseline: TypeScriptDiagnosticParseResult | None = None
        self._latest_differential: TypecheckDifferential | None = None
        self._latest_mode: ValidationMode | None = None
        self._latest_revision: int | None = None

    def _synchronize_run_state(self) -> None:
        run_id = self.activity.run_id
        if run_id == self._baseline_run_id:
            return
        self._baseline_run_id = run_id
        self._baseline_capture_started = False
        self._baseline = None
        self.latest_evidence = None
        self.latest_result = None
        self._latest_differential = None
        self._latest_mode = None
        self._latest_revision = None

    @staticmethod
    def _bounded(output: str, truncated: bool) -> tuple[str, bool]:
        normalized = output.strip()
        if len(normalized) <= MAX_VALIDATION_FAILURE_OUTPUT_CHARACTERS:
            return normalized, truncated
        return (
            normalized[:MAX_VALIDATION_FAILURE_OUTPUT_CHARACTERS]
            + "\n… Host validation output truncated",
            True,
        )

    @staticmethod
    def _from_receipt(
        receipt: dict[str, object], *, source: str, revision: int
    ) -> CreatorValidationCheck:
        return CreatorValidationCheck(
            command=str(receipt["command"]),
            status=(
                "passed" if receipt.get("status") == "passed" else "failed"
            ),
            exit_code=(
                receipt.get("exitCode")
                if isinstance(receipt.get("exitCode"), int)
                else None
            ),
            output=str(receipt.get("output") or ""),
            truncated=receipt.get("truncated") is True,
            revision=(
                int(receipt["revision"])
                if isinstance(receipt.get("revision"), int)
                else revision
            ),
            source="cached" if source == "cached" else "executed",
        )

    @staticmethod
    def _diagnostic_samples(
        diagnostics: tuple[TypeScriptDiagnostic, ...],
    ) -> list[dict[str, str]]:
        return [
            diagnostic.to_dict()
            for diagnostic in diagnostics[:MAX_DIAGNOSTIC_SAMPLE_COUNT]
        ]

    async def ensure_baseline(self) -> TypeScriptDiagnosticParseResult:
        """Capture the run baseline once, before the first side effect."""

        self._synchronize_run_state()
        if self._baseline_capture_started:
            return self._baseline or TypeScriptDiagnosticParseResult(
                available=False,
                diagnostics=(),
                reason="baseline capture did not produce a result",
            )

        self._baseline_capture_started = True
        if self.activity.revision != 0:
            parsed = TypeScriptDiagnosticParseResult(
                available=False,
                diagnostics=(),
                reason="baseline capture was requested after a workspace mutation",
            )
            exit_code = None
            truncated = False
        else:
            try:
                result = await self.runner.execute_known_command("pnpm typecheck")
            except Exception as error:
                result = CommandExecutionResult(str(error), None, False)
            parsed = parse_typescript_diagnostics(
                result.output,
                project_root=self.runner_project_root,
                exit_code=result.exit_code,
                truncated=result.truncated,
            )
            exit_code = result.exit_code
            truncated = result.truncated
        self._baseline = parsed
        if self.activity.logger is not None:
            self.activity.logger.record(
                "host_validation_baseline",
                {
                    "revision": self.activity.revision,
                    "command": "pnpm typecheck",
                    "captured": True,
                    "available": parsed.available,
                    "exitCode": exit_code,
                    "truncated": truncated,
                    "diagnosticCount": (
                        len(parsed.diagnostics) if parsed.available else None
                    ),
                    "diagnostics": self._diagnostic_samples(parsed.diagnostics),
                    **({"reason": parsed.reason} if parsed.reason else {}),
                },
            )
        return parsed

    async def capture_baseline(self) -> TypeScriptDiagnosticParseResult:
        """Compatibility alias for the Host baseline hook."""

        return await self.ensure_baseline()

    @property
    def runner_project_root(self) -> Path:
        project_root = getattr(self.runner, "project_root", None)
        if isinstance(project_root, (str, Path)):
            return Path(project_root).resolve()
        return self.project_root

    def _build_differential(
        self,
        mode: ValidationMode,
        current: TypeScriptDiagnosticParseResult,
    ) -> TypecheckDifferential:
        baseline = self._baseline
        if baseline is None or not baseline.available:
            return TypecheckDifferential(
                mode=mode,
                status="unavailable",
                baseline_captured=self._baseline_capture_started,
                baseline_available=False,
                current_available=current.available,
                current_diagnostics=current.diagnostics if current.available else (),
                reason=(
                    "baseline is unavailable"
                    if baseline is None
                    else baseline.reason or "baseline diagnostics are unavailable"
                ),
            )
        if not current.available:
            return TypecheckDifferential(
                mode=mode,
                status="unavailable",
                baseline_captured=self._baseline_capture_started,
                baseline_available=True,
                current_available=False,
                baseline_diagnostics=baseline.diagnostics,
                reason=current.reason or "current diagnostics are unavailable",
            )

        baseline_by_fingerprint = {
            diagnostic.fingerprint: diagnostic
            for diagnostic in baseline.diagnostics
        }
        current_by_fingerprint = {
            diagnostic.fingerprint: diagnostic
            for diagnostic in current.diagnostics
        }
        new = tuple(
            current_by_fingerprint[key]
            for key in sorted(
                set(current_by_fingerprint) - set(baseline_by_fingerprint)
            )
        )
        unchanged = tuple(
            current_by_fingerprint[key]
            for key in sorted(
                set(current_by_fingerprint) & set(baseline_by_fingerprint)
            )
        )
        resolved = tuple(
            baseline_by_fingerprint[key]
            for key in sorted(
                set(baseline_by_fingerprint) - set(current_by_fingerprint)
            )
        )
        return TypecheckDifferential(
            mode=mode,
            status="available",
            baseline_captured=self._baseline_capture_started,
            baseline_available=True,
            current_available=True,
            baseline_diagnostics=baseline.diagnostics,
            current_diagnostics=current.diagnostics,
            new_diagnostics=new,
            unchanged_diagnostics=unchanged,
            resolved_diagnostics=resolved,
        )

    @staticmethod
    def _typecheck_status(
        mode: ValidationMode, differential: TypecheckDifferential
    ) -> str:
        if differential.status != "available":
            return "failed"
        if mode == "clean":
            return "passed" if not differential.current_diagnostics else "failed"
        return "passed" if not differential.new_diagnostics else "failed"

    def _typecheck_output(
        self,
        result: CommandExecutionResult,
        differential: TypecheckDifferential,
    ) -> tuple[str, bool]:
        if differential.status != "available":
            output, truncated = self._bounded(result.output, result.truncated)
            return (
                f"TypeScript differential unavailable: {differential.reason or 'unknown reason'}."
                + (f"\n{output}" if output else "")
            ), truncated
        summary = json.dumps(
            {
                "exitCode": result.exit_code,
                "newDiagnostics": self._diagnostic_samples(
                    differential.new_diagnostics
                ),
                "unchangedDiagnosticCount": len(
                    differential.unchanged_diagnostics
                ),
                "unchangedDiagnostics": self._diagnostic_samples(
                    differential.unchanged_diagnostics
                ),
                "resolvedDiagnosticCount": len(
                    differential.resolved_diagnostics
                ),
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
        return summary, False

    @staticmethod
    def _workspace_warning(
        differential: TypecheckDifferential,
    ) -> dict[str, object] | None:
        if (
            differential.mode != "delta"
            or differential.status != "available"
            or not differential.unchanged_diagnostics
        ):
            return None
        count = len(differential.unchanged_diagnostics)
        return {
            "message": (
                f"工作区仍有 {count} 个任务开始前已经存在的 TypeScript 错误，"
                "本次未修改。"
            ),
            "diagnosticCount": count,
            "samples": [
                diagnostic.to_dict()
                for diagnostic in differential.unchanged_diagnostics[:MAX_DIAGNOSTIC_SAMPLE_COUNT]
            ],
        }

    def _record_attribution_degradation(
        self, revision: int, error: Exception
    ) -> None:
        if self.activity.logger is not None:
            self.activity.logger.record(
                "validation_attribution_degraded",
                {
                    "revision": revision,
                    "errorType": type(error).__name__,
                    "message": str(error),
                },
            )

    async def validate(self, mode: ValidationMode = "delta") -> CreatorValidationResult:
        if mode not in {"delta", "clean"}:
            raise ValueError("Validation mode must be 'delta' or 'clean'.")
        self._synchronize_run_state()
        await self.ensure_baseline()
        target_revision = self.activity.revision
        self.repair_state.begin_verification(target_revision)
        checks: list[CreatorValidationCheck] = []
        differential: TypecheckDifferential | None = None
        if self.activity.logger is not None:
            self.activity.logger.record(
                "host_validation_started",
                {
                    "revision": target_revision,
                    "validationMode": mode,
                    "commands": list(CREATOR_COMPLETION_VALIDATIONS),
                },
            )

        for command in CREATOR_COMPLETION_VALIDATIONS:
            if self.activity.revision != target_revision:
                break
            cached = self.activity.validation_at_revision(
                command, target_revision, validation_mode=mode
            )
            if cached is not None:
                if command == "pnpm typecheck":
                    if (
                        self._latest_revision == target_revision
                        and self._latest_mode == mode
                        and self._latest_differential is not None
                    ):
                        differential = self._latest_differential
                    else:
                        current = parse_typescript_diagnostics(
                            str(cached.get("output") or ""),
                            project_root=self.runner_project_root,
                            exit_code=(
                                cached.get("exitCode")
                                if isinstance(cached.get("exitCode"), int)
                                else None
                            ),
                            truncated=cached.get("truncated") is True,
                        )
                        differential = self._build_differential(mode, current)
                checks.append(
                    self._from_receipt(
                        cached, source="cached", revision=target_revision
                    )
                )
                continue
            result = await self.runner.execute_known_command(command)
            status = "passed" if result.exit_code == 0 else "failed"
            if command == "pnpm typecheck":
                current = parse_typescript_diagnostics(
                    result.output,
                    project_root=self.runner_project_root,
                    exit_code=result.exit_code,
                    truncated=result.truncated,
                )
                differential = self._build_differential(mode, current)
                status = self._typecheck_status(mode, differential)
                output, truncated = self._typecheck_output(result, differential)
            else:
                output, truncated = self._bounded(result.output, result.truncated)
            self.activity.record_validation(
                command,
                exit_code=result.exit_code,
                output=output,
                truncated=truncated,
                revision=target_revision,
                status=status,
                validation_mode=mode,
            )
            recorded = self.activity.validation_at_revision(
                command, target_revision, validation_mode=mode
            )
            if recorded is not None:
                checks.append(
                    self._from_receipt(
                        recorded, source="executed", revision=target_revision
                    )
                )
            if self.activity.revision != target_revision:
                break

        host_checks = ()
        if self.activity.revision == target_revision and self.host_verifier is not None:
            host_checks, _ = await self.host_verifier.verify()

        status = (
            "stale"
            if self.activity.revision != target_revision
            else "passed"
            if len(checks) == len(CREATOR_COMPLETION_VALIDATIONS)
            and all(check.status == "passed" for check in checks)
            and all(check.status == "passed" for check in host_checks)
            else "failed"
        )
        evidence = ValidationEvidence(
            revision=target_revision,
            status=status,
            checks=tuple(checks),
            host_checks=tuple(host_checks),
            differential=differential,
            workspace_warning=(
                None
                if differential is None
                else self._workspace_warning(differential)
            ),
        )
        self.latest_evidence = evidence
        if self.activity.logger is not None:
            self.activity.logger.record(
                "host_validation_evidence",
                evidence.to_dict(),
            )
        failure_semantics = attribution.attribute_validation_failure_safe(
            status=status,
            checks=evidence.checks,
            host_checks=evidence.host_checks,
            activity=self.activity,
            scope=self.scope,
            validation_mode=mode,
            differential=differential,
            on_degraded=lambda error: self._record_attribution_degradation(
                target_revision, error
            ),
        )
        validation = CreatorValidationResult(
            evidence=evidence,
            failure_semantics=failure_semantics,
        )
        self.latest_result = validation
        self._latest_differential = differential
        self._latest_mode = mode
        self._latest_revision = target_revision
        self.repair_state.record_result(
            target_revision, passed=status == "passed"
        )
        if self.activity.logger is not None:
            if differential is not None:
                self.activity.logger.record(
                    "host_validation_delta",
                    {
                        "revision": target_revision,
                        **differential.to_dict(),
                        "workspaceWarning": evidence.workspace_warning,
                    },
                )
            self.activity.logger.record(
                "host_validation_finished",
                {
                    "revision": target_revision,
                    "status": status,
                    "validationMode": mode,
                    "checks": [
                        {
                            "command": check.command,
                            "status": check.status,
                            "source": check.source,
                        }
                        for check in checks
                    ],
                    "hostChecks": [check.to_dict() for check in host_checks],
                    **(
                        {"failureSemantics": validation.failure_semantics}
                        if validation.failure_semantics is not None
                        else {}
                    ),
                },
            )
        return validation

    def metrics(self) -> dict[str, object]:
        self._synchronize_run_state()
        differential = self._latest_differential
        current = (
            differential
            if differential is not None
            and self._latest_revision == self.activity.revision
            else None
        )
        return {
            "validationBaselineCaptured": self._baseline_capture_started,
            "validationBaselineAvailable": bool(
                self._baseline is not None and self._baseline.available
            ),
            "baselineTypecheckDiagnostics": (
                len(self._baseline.diagnostics)
                if self._baseline is not None and self._baseline.available
                else None
            ),
            "currentTypecheckDiagnostics": (
                len(current.current_diagnostics)
                if current is not None and current.current_available
                else None
            ),
            "newTypecheckDiagnostics": (
                len(current.new_diagnostics)
                if current is not None and current.status == "available"
                else None
            ),
            "unchangedTypecheckDiagnostics": (
                len(current.unchanged_diagnostics)
                if current is not None and current.status == "available"
                else None
            ),
            "resolvedTypecheckDiagnostics": (
                len(current.resolved_diagnostics)
                if current is not None and current.status == "available"
                else None
            ),
            "validationMode": self._latest_mode or "delta",
        }

    def current_result(self) -> CreatorValidationResult | None:
        self._synchronize_run_state()
        result = self.latest_result
        if result is None or result.revision != self.activity.revision:
            return None
        return result
