from __future__ import annotations

from pathlib import Path
from pathlib import PurePosixPath
from typing import Protocol

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


def _change_layers_for_paths(paths: list[str]) -> list[str]:
    layers: list[str] = []
    for path in paths:
        normalized = path if path.startswith("/") else f"/{path}"
        layer = (
            "composition"
            if normalized
            in {"/app-ui/app-ui.json", "/plugins/registry.generated.ts"}
            else "plugin_behavior"
            if normalized.startswith("/plugins/")
            or normalized.startswith("/agent-ui/")
            else "runtime_capability"
            if normalized.startswith("/services/")
            else "agent_integration"
            if normalized.startswith("/agent-contract/")
            else None
        )
        if layer is not None and layer not in layers:
            layers.append(layer)
    return layers


def _change_layers_for_evidence(evidence: str) -> list[str]:
    normalized = evidence.replace("\\", "/")
    markers = (
        ("composition", ("app-ui/app-ui.json", "plugins/registry.generated.ts")),
        ("plugin_behavior", ("plugins/", "agent-ui/")),
        ("runtime_capability", ("services/",)),
        ("agent_integration", ("agent-contract/",)),
    )
    return [
        layer
        for layer, candidates in markers
        if any(candidate in normalized for candidate in candidates)
    ]


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

    def _failure_semantics(
        self,
        *,
        status: str,
        checks: list[CreatorValidationCheck],
        host_checks: tuple[object, ...],
    ) -> dict[str, object] | None:
        if status == "passed":
            return None
        receipt = self.activity.snapshot()
        changed_paths = [
            str(item.get("path"))
            for item in receipt.get("files", [])
            if isinstance(item, dict) and isinstance(item.get("path"), str)
        ]
        task_scope = _change_layers_for_paths(changed_paths)
        evidence = "\n".join(check.output for check in checks if check.status == "failed")
        if host_checks:
            evidence += "\n" + "\n".join(str(check) for check in host_checks)
        evidence_layers = _change_layers_for_evidence(evidence)
        mentioned_changed_path = any(
            path in evidence or PurePosixPath(path).name in evidence
            for path in changed_paths
        )
        if status == "stale":
            category = "stale_state"
            attribution = "unknown"
        elif mentioned_changed_path:
            category = "workspace_integrity"
            attribution = "introduced"
        elif any(layer in task_scope for layer in evidence_layers):
            category = "workspace_integrity"
            attribution = "in_scope"
        elif task_scope:
            category = "workspace_integrity"
            attribution = "unrelated"
        else:
            category = "workspace_integrity"
            attribution = "unknown"
        automatic_repair_allowed = attribution in {"introduced", "in_scope"}
        return {
            "category": category,
            "attribution": attribution,
            "taskScope": task_scope,
            "failureLayers": evidence_layers,
            "changedPaths": changed_paths,
            "automaticRepairAllowed": automatic_repair_allowed,
            "automaticCrossLayerRepairAllowed": False,
            "recovery": (
                "refresh_current_revision"
                if category == "stale_state"
                else "repair_in_scope"
                if automatic_repair_allowed
                else "stop_and_report_blocker"
            ),
        }

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
            failure_semantics=self._failure_semantics(
                status=status,
                checks=checks,
                host_checks=tuple(host_checks),
            ),
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
                    **(
                        {"failureSemantics": validation.failure_semantics}
                        if validation.failure_semantics is not None
                        else {}
                    ),
                },
            )
        return validation

    def current_result(self) -> CreatorValidationResult | None:
        result = self.latest_result
        if result is None or result.revision != self.activity.revision:
            return None
        return result
