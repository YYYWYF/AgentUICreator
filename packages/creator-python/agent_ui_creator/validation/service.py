from __future__ import annotations

from collections.abc import Protocol
from pathlib import Path

from ..activity import CreatorActivityRecorder
from ..repair import CreatorRepairState
from ..service_contracts.verification import ServiceContractAuthorizationVerifier
from .command_runner import CreatorValidationCommandRunner
from .models import (
    CREATOR_COMPLETION_VALIDATIONS,
    CommandExecutionResult,
    CreatorValidationCheck,
    CreatorValidationCommand,
    CreatorValidationResult,
)


MAX_VALIDATION_FAILURE_OUTPUT_CHARACTERS = 12_000


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
    ) -> None:
        self.activity = activity
        self.runner = runner or CreatorValidationCommandRunner(project_root)
        self.repair_state = repair_state or CreatorRepairState()
        self.latest_result: CreatorValidationResult | None = None
        self.host_verifier = host_verifier

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

    async def validate(self) -> CreatorValidationResult:
        target_revision = self.activity.revision
        self.repair_state.begin_verification(target_revision)
        checks: list[CreatorValidationCheck] = []
        if self.activity.logger is not None:
            self.activity.logger.record(
                "host_validation_started",
                {
                    "revision": target_revision,
                    "commands": list(CREATOR_COMPLETION_VALIDATIONS),
                },
            )

        for command in CREATOR_COMPLETION_VALIDATIONS:
            if self.activity.revision != target_revision:
                break
            cached = self.activity.validation_at_revision(
                command, target_revision
            )
            if cached is not None:
                checks.append(
                    self._from_receipt(
                        cached, source="cached", revision=target_revision
                    )
                )
                continue
            result = await self.runner.execute_known_command(command)
            output, truncated = self._bounded(result.output, result.truncated)
            self.activity.record_validation(
                command,
                exit_code=result.exit_code,
                output=output,
                truncated=truncated,
                revision=target_revision,
            )
            recorded = self.activity.validation_at_revision(
                command, target_revision
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
        validation = CreatorValidationResult(
            revision=target_revision,
            status=status,
            checks=tuple(checks),
            host_checks=tuple(host_checks),
        )
        self.latest_result = validation
        self.repair_state.record_result(
            target_revision, passed=status == "passed"
        )
        if self.activity.logger is not None:
            self.activity.logger.record(
                "host_validation_finished",
                {
                    "revision": target_revision,
                    "status": status,
                    "checks": [
                        {
                            "command": check.command,
                            "status": check.status,
                            "source": check.source,
                        }
                        for check in checks
                    ],
                    "hostChecks": [check.to_dict() for check in host_checks],
                },
            )
        return validation

    def current_result(self) -> CreatorValidationResult | None:
        result = self.latest_result
        if result is None or result.revision != self.activity.revision:
            return None
        return result
