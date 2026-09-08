from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Protocol

from ..activity import CreatorActivityRecorder
from ..runtime_diagnostics import RuntimeDiagnosticInspectionService
from ..validation import CREATOR_COMPLETION_VALIDATIONS, CreatorValidationService
from ..repair import CreatorRepairState


@dataclass(frozen=True, slots=True)
class CompletionDecision:
    accepted: bool
    text: str
    feedback: str | None = None


class ServiceAuthorizationFinalizer(Protocol):
    def has_current_applied(self) -> bool: ...

    def complete_current_applied(self) -> None: ...


class CreatorDevelopmentCompletionGate:
    """Prevent a final success claim without current static and Runtime evidence."""

    def __init__(
        self,
        *,
        activity: CreatorActivityRecorder,
        validation: CreatorValidationService,
        runtime: RuntimeDiagnosticInspectionService,
        repair_state: CreatorRepairState,
        service_authorization_finalizer: ServiceAuthorizationFinalizer | None = None,
    ) -> None:
        self.activity = activity
        self.validation = validation
        self.runtime = runtime
        self.repair_state = repair_state
        self.service_authorization_finalizer = service_authorization_finalizer

    @staticmethod
    def _check(identifier: str, passed: bool, evidence: str) -> dict[str, str]:
        return {
            "id": identifier,
            "status": "passed" if passed else "failed",
            "evidence": evidence,
        }

    def finalize(self, candidate: str) -> str:
        return self.review(candidate).text

    def review(self, candidate: str) -> CompletionDecision:
        receipt = self.activity.snapshot()
        if not receipt["files"]:
            if self.activity.semantic_noop_satisfied:
                if (
                    self.service_authorization_finalizer is not None
                    and self.service_authorization_finalizer.has_current_applied()
                ):
                    self.activity.record_verification(
                        {
                            "status": "failed",
                            "projectRevision": self.activity.revision,
                            "auditAttempts": self.repair_state.repair_rounds,
                            "checks": [
                                self._check(
                                    "service-authorization",
                                    False,
                                    "Applied Service authorization requires current Host validation.",
                                )
                            ],
                        }
                    )
                    return CompletionDecision(
                        False,
                        "无法确认请求已经完成：当前 Service authorization 尚未完成最终验证。",
                        (
                            "Applied Service authorization cannot be completed by a semantic noop. "
                            "Run current-revision Host validation and Runtime verification."
                        ),
                    )
                semantic_noop = self.activity.semantic_noop or {}
                self.activity.record_verification(
                    {
                        "status": "already-satisfied",
                        "projectRevision": self.activity.revision,
                        "auditAttempts": self.repair_state.repair_rounds,
                        "checks": [
                            self._check(
                                "semantic-noop",
                                True,
                                (
                                    "Host-validated semantic mutation reported changed=false; "
                                    f"source={semantic_noop.get('source', 'unknown')}; "
                                    f"reason={semantic_noop.get('reason', 'already-satisfied')}."
                                ),
                            )
                        ],
                    }
                )
                return CompletionDecision(True, candidate)
            read_only_marker = "[creator-verification:read-only]"
            stripped = candidate.strip()
            is_clarification = stripped.endswith("?") or stripped.endswith("？")
            is_declared_read_only = stripped.lower().startswith(read_only_marker)
            if not is_clarification and not is_declared_read_only:
                self.activity.record_verification(
                    {
                        "status": "failed",
                        "projectRevision": self.activity.revision,
                        "auditAttempts": self.repair_state.repair_rounds,
                        "checks": [
                            self._check(
                                "net-project-change",
                                False,
                                "The run produced no net project file change and was not declared read-only.",
                            )
                        ],
                    }
                )
                text = (
                    "无法确认请求已经完成：本次运行没有产生项目文件修改。"
                    "如果请求本来只需要读取或说明，请明确按只读结果结束；否则请继续实现。"
                )
                return CompletionDecision(
                    False,
                    text,
                    (
                        "The Creator completion gate found no net project change. "
                        "Continue implementing the requested change. If the request is "
                        "genuinely read-only, respond again starting with "
                        "[creator-verification:read-only]."
                    ),
                )
            self.activity.record_verification(
                {
                    "status": "no-project-change",
                    "projectRevision": self.activity.revision,
                    "auditAttempts": self.repair_state.repair_rounds,
                    "checks": [
                        self._check(
                            "net-project-change",
                            True,
                            "No net project file change was produced by this run.",
                        )
                    ],
                }
            )
            return CompletionDecision(
                True,
                (
                    stripped[len(read_only_marker) :].lstrip()
                    if is_declared_read_only
                    else candidate
                ),
            )

        checks: list[dict[str, str]] = [
            self._check(
                "net-project-change",
                True,
                f"{len(receipt['files'])} net changed file(s).",
            )
        ]
        validation = self.validation.current_result()
        for command in CREATOR_COMPLETION_VALIDATIONS:
            check = (
                None
                if validation is None
                else next(
                    (
                        item
                        for item in validation.checks
                        if item.command == command
                    ),
                    None,
                )
            )
            passed = (
                validation is not None
                and validation.status == "passed"
                and check is not None
                and check.status == "passed"
            )
            checks.append(
                self._check(
                    command,
                    passed,
                    (
                        f"revision={check.revision}; source={check.source}; "
                        f"exitCode={check.exit_code}"
                        if check is not None
                        else (
                            "No passing validation exists for current revision "
                            f"{self.activity.revision}."
                        )
                    ),
                )
            )

        if validation is None or validation.status != "passed":
            self.activity.record_verification(
                {
                    "status": "failed",
                    "projectRevision": self.activity.revision,
                    "auditAttempts": self.repair_state.repair_rounds,
                    "checks": checks,
                }
            )
            text = (
                "无法确认本次插件开发已经完成：当前 mutation revision 尚未通过 "
                "Creator Host 的 verify:ui 与 typecheck。修改已保留，请根据最新验证证据继续修复。"
            )
            validation_evidence = (
                "No validation was run for the current revision."
                if validation is None
                else "\n\n".join(
                    f"{check.command}: {check.status}\n{check.output}"
                    for check in validation.checks
                )
            )
            if self.repair_state.limit_reached:
                return CompletionDecision(True, text)
            return CompletionDecision(
                False,
                text,
                (
                    "The current mutation revision has not passed Host validation. "
                    "Repair the project using this bounded evidence, then call "
                    "validate_creator_changes again before Runtime verification:\n\n"
                    f"{validation_evidence}"
                ),
            )

        runtime = self.runtime.current_result()
        runtime_status = (
            "unverified" if runtime is None else str(runtime["runtimeStatus"])
        )
        runtime_passed = runtime_status == "passed"
        checks.append(
            self._check(
                "runtime-verification",
                runtime_passed,
                (
                    "Fresh Runtime evidence for the current AppUIModel hash has no open errors."
                    if runtime_passed
                    else f"runtimeStatus={runtime_status}; fresh evidence is required after the latest mutation."
                ),
            )
        )
        self.activity.record_verification(
            {
                "status": "changed-and-verified" if runtime_passed else "failed",
                "projectRevision": self.activity.revision,
                "auditAttempts": self.repair_state.repair_rounds,
                "checks": checks,
            }
        )
        if runtime_passed:
            if self.service_authorization_finalizer is not None:
                self.service_authorization_finalizer.complete_current_applied()
            return CompletionDecision(True, candidate)
        if runtime_status == "unavailable":
            if self.service_authorization_finalizer is not None:
                self.service_authorization_finalizer.complete_current_applied()
            return CompletionDecision(
                True,
                (
                    "静态验证已经通过；当前没有可用的 Runtime 验证证据。"
                    "源码和组合修改已保留，但不能声称已经通过运行时验证。"
                ),
            )
        if runtime_status == "failed":
            current_errors = runtime.get("currentErrors", []) if runtime else []
            composition_failures = [
                check
                for check in (runtime.get("compositionChecks", []) if runtime else [])
                if check.get("status") != "passed"
            ]
            if not current_errors and composition_failures:
                text = (
                    "无法确认本次插件开发已经完成：最新 Runtime composition 与当前启用挂载不一致，"
                    f"仍有 {len(composition_failures)} 个实例检查未通过。修改已保留，请继续修复并重新验证。"
                )
            else:
                text = (
                    "无法确认本次插件开发已经完成：最新 Runtime 证据仍有 "
                    f"{len(current_errors)} 个未解决错误。修改已保留，请继续修复并重新验证。"
                )
            if self.repair_state.limit_reached:
                return CompletionDecision(True, text)
            return CompletionDecision(
                False,
                text,
                (
                    "Runtime verification failed. Inspect and repair the implicated "
                    "Plugin source, run current-revision static validation, then inspect "
                    "Runtime again. Current bounded evidence:\n"
                    + json.dumps(runtime, ensure_ascii=False, default=str)
                ),
            )
        text = (
            "无法确认本次插件开发已经完成：Runtime 证据缺失或早于最后一次源码/组合修改。"
            "修改已保留，请在最新 Runtime 观察到达后重新验证。"
        )
        if self.repair_state.limit_reached:
            return CompletionDecision(True, text)
        return CompletionDecision(
            False,
            text,
            (
                "Runtime verification is missing or stale for the latest mutation. "
                "Call inspect_runtime_errors after fresh Runtime evidence arrives."
            ),
        )
