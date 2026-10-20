from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import TYPE_CHECKING, Protocol

from ..debugging import DebuggingEvidence, evidence_hash
from ..activity import CreatorActivityRecorder
from ..activity.recovery import recover_registry_evidence
from ..app_ui_model import ProjectMutationCoordinator
from ..files import read_creator_file_state
from ..operator import OperatorClient
from ..project_paths import agent_ui_source_path
from ..resource_scope import project_logical_path
from ..repair import CreatorRepairState
from ..responsive_repair import ResponsiveRiskTracker
from ..service_contracts.verification import ServiceContractAuthorizationVerifier
from . import attribution
from .command_runner import CreatorValidationCommandRunner
from .errors import RegistryIntegrityError
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
        operator: OperatorClient | None = None,
        mutation_coordinator: ProjectMutationCoordinator | None = None,
    ) -> None:
        self.debugging = DebuggingEvidence()
        self.responsive_risks = ResponsiveRiskTracker()
        self.project_root = Path(project_root).resolve()
        self.activity = activity
        self.runner = runner or CreatorValidationCommandRunner(project_root)
        self.repair_state = repair_state or CreatorRepairState()
        self.latest_evidence: ValidationEvidence | None = None
        self.latest_result: CreatorValidationResult | None = None
        self.host_verifier = host_verifier
        self.scope = scope
        self.operator = operator
        self.mutation_coordinator = mutation_coordinator
        self._registry_sync_mutation_index = 0
        self._registry_recovery_synced: tuple[str, ...] = ()
        self._baseline_run_id: str | None = None
        self._baseline_retryable = False
        self._baseline_retried = False
        self._baseline_capture_started = False
        self._baseline: TypeScriptDiagnosticParseResult | None = None
        self._latest_differential: TypecheckDifferential | None = None
        self._latest_mode: ValidationMode | None = None
        self._latest_revision: int | None = None
        self._build_requested = False
        self._registry_integrity_error: RegistryIntegrityError | None = None
        self._infrastructure_retries: set[tuple[int, str]] = set()

    def _synchronize_run_state(self) -> None:
        run_id = self.activity.run_id
        if run_id == self._baseline_run_id:
            return
        self.debugging.ensure_run(run_id)
        self.responsive_risks = ResponsiveRiskTracker()
        self._baseline_run_id = run_id
        self._baseline_retryable = False
        self._baseline_retried = False
        self._baseline_capture_started = False
        self._baseline = None
        self.latest_evidence = None
        self.latest_result = None
        self._latest_differential = None
        self._latest_mode = None
        self._latest_revision = None
        self._build_requested = False
        self._registry_integrity_error = None
        self._infrastructure_retries.clear()
        self._registry_sync_mutation_index = 0
        self._registry_recovery_synced: tuple[str, ...] = ()

    async def _synchronize_plugin_registry(self) -> None:
        if self._registry_integrity_error is not None:
            raise self._registry_integrity_error
        if self.operator is None or self.mutation_coordinator is None:
            return
        recovered = recover_registry_evidence(self.activity)
        self.activity.recovered_paths = recovered
        changes = (*self.activity.mutation_paths[self._registry_sync_mutation_index:], *(recovered if recovered != self._registry_recovery_synced else ()))
        if not any(
            (logical := project_logical_path(path, self.project_root)).startswith("/plugins/")
            and logical.rsplit("/", 1)[-1] in {"manifest.json", "definition.ts"}
            for path in changes
        ):
            self._registry_sync_mutation_index = len(self.activity.mutation_paths)
            return
        registry_path = agent_ui_source_path(self.project_root, "plugins/registry.generated.ts")
        async with self.mutation_coordinator.transaction(self.project_root):
            if recovered != recover_registry_evidence(self.activity):
                self._registry_integrity_error = RegistryIntegrityError(
                    "Registry recovery evidence changed before synchronization.", path=registry_path,
                )
                raise self._registry_integrity_error
            if recovered and self.activity.logger is not None:
                self.activity.logger.record("registry_recovery_verified", {"paths": list(recovered), "authority": "derived_registry_only"})
            before = read_creator_file_state(self.project_root, registry_path)
            if not before.exists:
                self._registry_sync_mutation_index = len(self.activity.mutation_paths)
                return
            self.activity.capture_before_content(registry_path, before.content)
            operation_error: BaseException | None = None
            result = None
            try:
                result = await self.operator.synchronize_plugin_registry(
                    expected_source_hash=before.hash
                )
            except BaseException as error:
                operation_error = error
            try:
                after = read_creator_file_state(self.project_root, registry_path)
            except Exception as error:
                self._registry_integrity_error = RegistryIntegrityError(
                    "Cannot reconcile Plugin Registry disk state.", path=registry_path,
                    cause=operation_error if operation_error is not None else error,
                )
                raise self._registry_integrity_error from error
            changed = after.hash != before.hash
            if changed:
                # Record actual disk effects before interpreting the Operator response.
                self.activity.touch(registry_path)
            if operation_error is not None:
                if changed:
                    self._registry_integrity_error = RegistryIntegrityError(
                        "Plugin Registry changed before synchronization failed.",
                        path=registry_path, cause=operation_error,
                    )
                if not isinstance(operation_error, Exception):
                    raise operation_error  # cancellation retains its control-flow semantics
                if self._registry_integrity_error is not None:
                    raise self._registry_integrity_error from operation_error
                raise operation_error
            expected_path = registry_path.lstrip("/")
            if not isinstance(result, dict) or result.get("path") != expected_path or result.get("changed") is not changed:
                self._registry_integrity_error = RegistryIntegrityError(
                    "Host Plugin Registry synchronization result disagrees with disk state.",
                    path=registry_path,
                )
                raise self._registry_integrity_error
            if changed:
                self.activity.file_observations.observe(registry_path)
        self._registry_sync_mutation_index = len(self.activity.mutation_paths)
        self._registry_recovery_synced = recovered

    @staticmethod
    def _bounded(output: str, truncated: bool) -> tuple[str, bool]:
        normalized = output.strip()
        if len(normalized) <= MAX_VALIDATION_FAILURE_OUTPUT_CHARACTERS:
            return normalized, truncated
        marker = normalized.find("\n{")
        json_start = 0 if normalized.startswith("{") else marker + 1 if marker >= 0 else -1
        if json_start >= 0:
            try:
                report, _ = json.JSONDecoder().raw_decode(normalized[json_start:])
            except ValueError:
                report = None
            if isinstance(report, dict) and isinstance(report.get("errors"), list):
                errors = [
                    f"{item.get('code', 'ERROR')}: {item.get('message', '')}"
                    for item in report["errors"][:MAX_DIAGNOSTIC_SAMPLE_COUNT]
                    if isinstance(item, dict)
                ]
                if errors:
                    normalized = "Validation errors:\n" + "\n".join(errors) + "\n\n" + normalized
        return (
            normalized[:MAX_VALIDATION_FAILURE_OUTPUT_CHARACTERS]
            + "\n… Host validation output truncated",
            True,
        )

    @staticmethod
    def _from_receipt(
        receipt: dict[str, object], *, check_id: CreatorValidationCommand, source: str, revision: int
    ) -> CreatorValidationCheck:
        return CreatorValidationCheck(
            check_id=check_id,
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
            failure_kind=receipt.get("failureKind"),
        )

    @staticmethod
    def _diagnostic_samples(
        diagnostics: tuple[TypeScriptDiagnostic, ...],
    ) -> list[dict[str, object]]:
        return [
            diagnostic.to_dict()
            for diagnostic in diagnostics[:MAX_DIAGNOSTIC_SAMPLE_COUNT]
        ]

    def _bound_ui_verifier(self, command: CreatorValidationCommand) -> bool:
        if command != "pnpm verify:ui" or self.operator is None or not (self.project_root / ".agent-ui" / "consumer.json").is_file():
            return False
        try:
            manifest = json.loads((self.project_root / "package.json").read_text(encoding="utf-8"))
            return not manifest.get("scripts", {}).get("verify:ui")
        except (OSError, ValueError, AttributeError):
            return False

    async def _execute_validation(self, command: CreatorValidationCommand) -> CommandExecutionResult:
        if self._bound_ui_verifier(command):
            result = await self.operator.verify_ui_project()
            output = json.dumps(result, ensure_ascii=False)
            return CommandExecutionResult(output[:100_000], 0 if result.get("status") == "passed" else 1, len(output) > 100_000)
        return await self.runner.execute_known_command(command)

    def _command_label(self, command: CreatorValidationCommand) -> str:
        if self._bound_ui_verifier(command):
            return "Operator verify_ui_project"
        resolver = getattr(self.runner, "command_label", None)
        return resolver(command) if resolver is not None else command

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
            self._baseline_retryable = result.exit_code is None and result.failure_kind in {None, "timeout", "start_failed", "infrastructure"}
            exit_code = result.exit_code
            truncated = result.truncated
        self._baseline = parsed
        if self.activity.logger is not None:
            self.activity.logger.record(
                "host_validation_baseline",
                {
                    "revision": self.activity.revision,
                    "command": self._command_label("pnpm typecheck"),
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
    def has_pre_mutation_baseline(self) -> bool:
        """Whether a usable TypeScript baseline was captured before any mutation."""

        self._synchronize_run_state()
        return (
            self._baseline_capture_started
            and self._baseline is not None
            and self._baseline.available
        )

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
        baseline_counts = Counter(
            diagnostic.fingerprint for diagnostic in baseline.diagnostics
        )
        current_counts = Counter(
            diagnostic.fingerprint for diagnostic in current.diagnostics
        )
        new = tuple(
            current_by_fingerprint[key]
            for key in sorted(current_counts)
            for _ in range(current_counts[key] - baseline_counts[key])
        )
        unchanged = tuple(
            current_by_fingerprint[key]
            for key in sorted(current_counts)
            for _ in range(min(current_counts[key], baseline_counts[key]))
        )
        resolved = tuple(
            baseline_by_fingerprint[key]
            for key in sorted(baseline_counts)
            for _ in range(baseline_counts[key] - current_counts[key])
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

    async def validate(self, mode: ValidationMode = "delta", *, include_build: bool = False, retry_infrastructure: bool = False) -> CreatorValidationResult:
        if mode not in {"delta", "clean"}:
            raise ValueError("Validation mode must be 'delta' or 'clean'.")
        self._synchronize_run_state()
        baseline_retried_now = False
        if retry_infrastructure and self.activity.revision == 0 and self._baseline_retryable and not self._baseline_retried:
            self._baseline_retried = True
            self._baseline_capture_started = False
            self._latest_differential = None
            baseline_retried_now = True
        await self.ensure_baseline()
        await self._synchronize_plugin_registry()
        target_revision = self.activity.revision
        self.repair_state.begin_verification(target_revision)
        checks: list[CreatorValidationCheck] = []
        differential: TypecheckDifferential | None = None
        self._build_requested = self._build_requested or include_build
        commands = (*CREATOR_COMPLETION_VALIDATIONS, "pnpm build") if self._build_requested else CREATOR_COMPLETION_VALIDATIONS
        if self.activity.logger is not None:
            self.activity.logger.record(
                "host_validation_started",
                {
                    "revision": target_revision,
                    "validationMode": mode,
                    "commands": [self._command_label(command) for command in commands],
                },
            )

        for command in commands:
            if self.activity.revision != target_revision:
                break
            command_label = self._command_label(command)
            cached = self.activity.validation_at_revision(
                command_label, target_revision, validation_mode=mode
            )
            retry_key = (target_revision, command)
            if (retry_infrastructure and cached is not None and (
                    cached.get("failureKind") in {"timeout", "start_failed", "infrastructure"}
                    # Differential status/output were derived from the old,
                    # unavailable baseline; refresh them once after recovery.
                    or (baseline_retried_now and command == "pnpm typecheck")
                    )
                    and retry_key not in self._infrastructure_retries):
                self._infrastructure_retries.add(retry_key)
                cached = None
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
                        cached, check_id=command, source="cached", revision=target_revision
                    )
                )
                continue
            result = await self._execute_validation(command)
            if command == "pnpm verify:ui":
                self.responsive_risks.observe(result.output, truncated=result.truncated)
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
                command_label,
                exit_code=result.exit_code,
                output=output,
                truncated=truncated,
                revision=target_revision,
                status=status,
                validation_mode=mode,
                failure_kind=result.failure_kind or ("infrastructure" if result.exit_code is None else None),
            )
            recorded = self.activity.validation_at_revision(
                command_label, target_revision, validation_mode=mode
            )
            if recorded is not None:
                checks.append(
                    self._from_receipt(
                        recorded, check_id=command, source="executed", revision=target_revision
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
            if len(checks) == len(commands)
            and all(check.status == "passed" for check in checks)
            and all(check.status == "passed" for check in host_checks)
            else "failed"
        )
        evidence = ValidationEvidence(
            revision=target_revision,
            status=status,
            checks=tuple(checks),
            host_checks=tuple(host_checks),
            responsive_summary=self.responsive_risks.to_dict(),
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
        baseline_infrastructure_failed = (
            status == "failed" and self._baseline_retryable
            and self._baseline is not None and not self._baseline.available
        )
        if any(check.failure_kind is not None for check in checks) or baseline_infrastructure_failed:
            retry_available = (
                baseline_infrastructure_failed and target_revision == 0 and not self._baseline_retried
            ) or any(
                check.failure_kind in {"timeout", "start_failed", "infrastructure"}
                and (target_revision, check.check_id) not in self._infrastructure_retries
                for check in checks
            )
            failure_semantics = {
                "category": "validation_infrastructure",
                "failures": [
                    *[{"command": check.command, "kind": check.failure_kind}
                      for check in checks if check.failure_kind is not None],
                    *([{"command": "typecheck baseline", "kind": "infrastructure"}]
                      if baseline_infrastructure_failed else []),
                ],
                "automaticRepairAllowed": False,
                "automaticCrossLayerRepairAllowed": False,
                "retryAllowed": retry_available,
                "recovery": "retry_infrastructure_once" if retry_available else "stop_and_report_blocker",
            }
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

    def bind_debugging_targets(self, targets: list[dict[str, str]]) -> None:
        current = self.current_result()
        differential = None if current is None else current.differential
        if differential is None or not differential.current_available:
            raise ValueError("Current TypeScript evidence is unavailable; no targets were bound.")
        selected = {}
        for target in targets:
            matches = [item for item in differential.current_diagnostics
                       if item.path == target.get("path") and item.code == target.get("code")
                       and (not target.get("messageHash") or
                            self.debugging.static_identity(item)["messageHash"] == target["messageHash"])]
            if not matches and target.get("path") and target.get("code"):
                # Complete current evidence also proves an explicitly named error
                # is already absent. This permits a truthful no-change finish.
                identity = {"path": target["path"], "code": target["code"],
                            "messageHash": target.get("messageHash"), "revision": current.revision}
                if not any(item.get("path") == identity["path"] and item.get("code") == identity["code"]
                           and (not identity["messageHash"] or item.get("messageHash") == identity["messageHash"])
                           for item in self.debugging.targets.values()):
                    selected[evidence_hash((identity["path"], identity["code"], identity["messageHash"]))] = identity
                continue
            if len(matches) != 1:
                raise ValueError("Target must identify one current diagnostic; use its canonical path, code and messageHash.")
            item = matches[0]
            selected[self.debugging.static_key(item)] = {
                **self.debugging.static_identity(item), "revision": current.revision,
            }
        self.debugging.targets.update(selected)

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
            "debuggingMetrics": self.debugging.metrics(
                differential=current, repair_state=self.repair_state, revision=self.activity.revision,
            ),
        }

    def current_result(self) -> CreatorValidationResult | None:
        self._synchronize_run_state()
        result = self.latest_result
        if result is None or result.revision != self.activity.revision:
            return None
        return result
