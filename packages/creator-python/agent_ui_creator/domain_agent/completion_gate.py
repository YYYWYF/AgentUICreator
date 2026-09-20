from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Protocol

from ..activity import CreatorActivityRecorder
from ..resource_scope import change_layers_for_paths
from ..runtime_diagnostics import RuntimeDiagnosticInspectionService
from ..run_control import CreatorRunControlState
from ..validation import CREATOR_COMPLETION_VALIDATIONS, CreatorValidationService
from ..repair import CreatorRepairState
from ..verification_policy import (
    CreatorVerificationMode,
    DEFAULT_CREATOR_VERIFICATION_MODE,
)
from .change_scope import runtime_failure_layers


@dataclass(frozen=True, slots=True)
class CompletionDecision:
    accepted: bool
    text: str
    feedback: str | None = None


class ServiceAuthorizationFinalizer(Protocol):
    def has_current_applied(self) -> bool: ...

    def complete_current_applied(self) -> None: ...


class CreatorDevelopmentCompletionGate:
    """Enforce the configured static-only or static-plus-Runtime completion boundary."""

    def __init__(
        self,
        *,
        activity: CreatorActivityRecorder,
        validation: CreatorValidationService,
        runtime: RuntimeDiagnosticInspectionService,
        repair_state: CreatorRepairState,
        service_authorization_finalizer: ServiceAuthorizationFinalizer | None = None,
        run_control: CreatorRunControlState | None = None,
        verification_mode: CreatorVerificationMode = DEFAULT_CREATOR_VERIFICATION_MODE,
    ) -> None:
        self.activity = activity
        self.validation = validation
        self.runtime = runtime
        self.repair_state = repair_state
        self.service_authorization_finalizer = service_authorization_finalizer
        self.run_control = run_control
        self.verification_mode = verification_mode

    @staticmethod
    def _check(identifier: str, passed: bool, evidence: str) -> dict[str, str]:
        return {
            "id": identifier,
            "status": "passed" if passed else "failed",
            "evidence": evidence,
        }

    @staticmethod
    def _has_fresh_runtime_contradiction(runtime: object) -> bool:
        if not isinstance(runtime, dict):
            return False
        if runtime.get("compositionFresh") is not True:
            return False
        if runtime.get("runtimeObserved") is False:
            return False
        current_errors = runtime.get("currentErrors")
        if (
            isinstance(current_errors, list)
            and current_errors
            and runtime.get("diagnosticFresh") is not False
        ):
            return True
        if runtime.get("compositionVerified") is False:
            return True
        composition_checks = runtime.get("compositionChecks")
        if isinstance(composition_checks, list) and any(
            isinstance(check, dict) and check.get("status") != "passed"
            for check in composition_checks
        ):
            return True
        verification_tail = runtime.get("verificationTail")
        if isinstance(verification_tail, dict):
            geometry = verification_tail.get("geometryVerification")
            if isinstance(geometry, dict) and geometry.get("status") == "failed":
                return True
        return False

    @staticmethod
    def _runtime_observation_text(runtime_status: str) -> str:
        if runtime_status == "stale":
            return (
                "静态验证已经通过；Runtime 未观测到当前修改的最新证据。"
                "修改已提交，暂不判定为 Runtime 失败。"
            )
        if runtime_status == "unavailable":
            return (
                "静态验证已经通过；Runtime 暂不可用。"
                "修改已提交，暂不判定为 Runtime 失败。"
            )
        return (
            "静态验证已经通过；当前没有 fresh Runtime 证据明确矛盾。"
            "修改已提交，暂不判定为 Runtime 失败。"
        )

    @staticmethod
    def _workspace_warning_text(validation: object) -> str | None:
        warning = getattr(validation, "workspace_warning", None)
        if not isinstance(warning, dict):
            return None
        message = warning.get("message")
        return message if isinstance(message, str) and message else None

    @classmethod
    def _with_workspace_warning(cls, text: str, validation: object) -> str:
        warning = cls._workspace_warning_text(validation)
        if warning is None or warning in text:
            return text
        return f"{text.rstrip()}\n\n{warning}"

    def finalize(self, candidate: str) -> str:
        return self.review(candidate).text

    def review(self, candidate: str) -> CompletionDecision:
        if self.run_control is not None and self.run_control.blocked:
            return CompletionDecision(
                True,
                self.run_control.render_blocker_response(),
            )
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
                            "verificationMode": self.verification_mode,
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
                            "Run current-revision Host validation"
                            + (
                                " and Runtime verification."
                                if self.verification_mode == "static_and_runtime"
                                else "."
                            )
                        ),
                    )
                semantic_noop = self.activity.semantic_noop or {}
                self.activity.record_verification(
                    {
                        "status": "already-satisfied",
                        "verificationMode": self.verification_mode,
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
                        "verificationMode": self.verification_mode,
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
                    "verificationMode": self.verification_mode,
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
                    "verificationMode": self.verification_mode,
                    "projectRevision": self.activity.revision,
                    "auditAttempts": self.repair_state.repair_rounds,
                    "checks": checks,
                }
            )
            failure_semantics = (
                None if validation is None else validation.failure_semantics
            )
            if (
                isinstance(failure_semantics, dict)
                and failure_semantics.get("automaticRepairAllowed") is False
                and failure_semantics.get("category") == "workspace_integrity"
            ):
                attribution = str(
                    failure_semantics.get("attribution") or "unknown"
                )
                return CompletionDecision(
                    True,
                    (
                        "当前修改已保留，但 Creator Host 发现了不属于本轮可自动修复范围的 "
                        "workspace-integrity 阻塞。为保持任务边界，未跨层修改源码；"
                        f"归因={attribution}。请先单独处理该阻塞，或明确授权把它纳入任务范围。"
                    ),
                )
            text = (
                "无法确认本次插件开发已经完成：当前 mutation revision 尚未通过 "
                "Creator Host 的 verify:ui 与 typecheck。修改已保留，请根据最新验证证据继续修复。"
            )
            validation_evidence = (
                "No validation was run for the current revision."
                if validation is None
                else "\n\n".join(
                    (
                        f"{check.command}: {check.status}\n{check.output}"
                        for check in validation.checks
                    )
                )
            )
            if validation is not None and validation.differential is not None:
                validation_evidence = (
                    f"{validation_evidence}\n\nTypeScript differential:\n"
                    + json.dumps(
                        validation.differential.to_dict(),
                        ensure_ascii=False,
                        separators=(",", ":"),
                    )
                )
            if self.repair_state.limit_reached:
                return CompletionDecision(True, text)
            verification_next_step = (
                "before Runtime verification"
                if self.verification_mode == "static_and_runtime"
                else "then finish the run"
            )
            return CompletionDecision(
                False,
                text,
                (
                    "The current mutation revision has not passed Host validation. "
                    "Repair only an introduced or explicitly in-scope defect using "
                    "this bounded evidence, then call "
                    f"validate_creator_changes again {verification_next_step}:\n\n"
                    f"{validation_evidence}"
                ),
            )

        if self.verification_mode == "static_only":
            self.activity.record_verification(
                {
                    "status": "changed-and-statically-verified",
                    "verificationMode": self.verification_mode,
                    "runtimeStatus": "not-run",
                    "projectRevision": self.activity.revision,
                    "auditAttempts": self.repair_state.repair_rounds,
                    "checks": checks,
                }
            )
            if self.service_authorization_finalizer is not None:
                self.service_authorization_finalizer.complete_current_applied()
            return CompletionDecision(
                True, self._with_workspace_warning(candidate, validation)
            )

        runtime = self.runtime.current_result()
        runtime_status = (
            "unavailable" if runtime is None else str(runtime["runtimeStatus"])
        )
        runtime_passed = runtime_status == "passed"
        fresh_runtime_contradiction = (
            runtime_status == "failed"
            and self._has_fresh_runtime_contradiction(runtime)
        )
        checks.append(
            self._check(
                "runtime-verification",
                runtime_passed,
                (
                    "Fresh Runtime evidence for the current AppUIModel hash has no open errors."
                    if runtime_passed
                    else "Fresh Runtime evidence explicitly contradicts the requested state."
                    if fresh_runtime_contradiction
                    else f"runtimeStatus={runtime_status}; no fresh contradictory evidence is available."
                ),
            )
        )
        checks[-1]["status"] = (
            "passed"
            if runtime_passed
            else "failed"
            if fresh_runtime_contradiction
            else "stale"
            if runtime_status == "stale"
            else "unavailable"
        )
        self.activity.record_verification(
            {
                "status": (
                    "changed-and-verified"
                    if runtime_passed
                    else "failed"
                    if fresh_runtime_contradiction
                    else "changed-unverified"
                ),
                "verificationMode": self.verification_mode,
                "projectRevision": self.activity.revision,
                "auditAttempts": self.repair_state.repair_rounds,
                "checks": checks,
                **(
                    {"runtimeStatus": runtime_status}
                    if not runtime_passed
                    and runtime_status in {"failed", "stale", "unavailable"}
                    else {}
                ),
            }
        )
        if runtime_passed:
            if self.service_authorization_finalizer is not None:
                self.service_authorization_finalizer.complete_current_applied()
            return CompletionDecision(
                True, self._with_workspace_warning(candidate, validation)
            )
        if not fresh_runtime_contradiction:
            if self.service_authorization_finalizer is not None:
                self.service_authorization_finalizer.complete_current_applied()
            return CompletionDecision(
                True,
                self._with_workspace_warning(
                    self._runtime_observation_text(runtime_status),
                    validation,
                ),
            )
        if runtime_status == "failed":
            geometry_verification = (
                runtime.get("verificationTail", {}).get("geometryVerification")
                if isinstance(runtime.get("verificationTail"), dict)
                else None
            )
            if (
                isinstance(geometry_verification, dict)
                and geometry_verification.get("status") == "failed"
            ):
                text = (
                    "无法确认本次插件开发已经完成：Host 的最新 Runtime 几何证据与请求的"
                    " Composition placement 或尺寸矛盾。修改已保留，请继续修复并重新验证。"
                )
                if self.repair_state.limit_reached:
                    return CompletionDecision(True, text)
                return CompletionDecision(
                    False,
                    text,
                    (
                        "The Host verification tail found a fresh geometry contradiction for the "
                        "semantic Composition mutation. Repair only the implicated AppUIModel "
                        "placement or size, validate the new revision, and inspect Runtime again. "
                        "Current bounded evidence:\n"
                        + json.dumps(runtime, ensure_ascii=False, default=str)
                    ),
                )
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
            changed_paths = [
                str(item.get("path"))
                for item in receipt.get("files", [])
                if isinstance(item, dict) and isinstance(item.get("path"), str)
            ]
            if change_layers_for_paths(changed_paths) == ("composition",):
                failure_layers = runtime_failure_layers(runtime or {})
                if failure_layers and all(
                    layer == "composition" for layer in failure_layers
                ):
                    return CompletionDecision(
                        False,
                        text,
                        (
                            "Runtime verification found an in-scope Composition "
                            "precondition. Preserve the current layer, revise the "
                            "AppUIModel with mutate_app_ui_model, validate the new "
                            "revision, and inspect Runtime again. Current bounded "
                            "evidence:\n"
                            + json.dumps(runtime, ensure_ascii=False, default=str)
                        ),
                    )
                return CompletionDecision(
                    True,
                    (
                        "当前 Composition 修改已保留，但最新 Runtime 证据暴露了当前层之外"
                        "或无法可靠归因的 workspace-integrity 阻塞。该错误不授权本轮跨层"
                        "修改；请单独处理，或明确把相应 repair 纳入任务范围。"
                    ),
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
