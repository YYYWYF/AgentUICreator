from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Protocol

from ..activity import CreatorActivityRecorder
from ..domain_tools.recovery_tools import CreatorRecoveryQueries
from ..resource_scope import change_layers_for_paths, change_layer_for_path, resource_keys_for_paths
from ..project_paths import agent_ui_source_path
from ..runtime_diagnostics.layout_intent import has_fixed_geometry
from ..runtime_diagnostics import RuntimeDiagnosticInspectionService
from ..run_control import CompletionStatus, CreatorRunControlState
from ..validation import CREATOR_COMPLETION_VALIDATIONS, CreatorValidationService
from ..repair import CreatorRepairState
from ..plugin_development.delivery import (
    delivery_report, delivery_status_satisfies_mode, source_delivery_contract,
)
from ..plugin_development.authority import PluginDevelopmentAuthority
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
    completion: CompletionStatus | None = None
    reason: str | None = None


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
        plugin_development_authority: PluginDevelopmentAuthority | None = None,
        recovery: CreatorRecoveryQueries | None = None,
    ) -> None:
        self.recovery = recovery
        self.activity = activity
        self.validation = validation
        self.runtime = runtime
        self.repair_state = repair_state
        self.service_authorization_finalizer = service_authorization_finalizer
        self.run_control = run_control
        self.verification_mode = verification_mode
        self.plugin_development_authority = plugin_development_authority
        self._delivery_review_run_id: str | None = None

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
                "静态检查已通过，但运行时尚未反馈本次修改后的最新状态。"
                "修改已应用，暂时无法确认运行时状态。"
            )
        if runtime_status == "unavailable":
            return (
                "静态检查已通过，但运行时当前不可用。"
                "修改已应用，暂时无法完成运行时核验。"
            )
        return (
            "静态检查已通过；目前没有最新运行时证据表明存在问题。"
            "修改已应用，暂时无法确认运行时状态。"
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

    def _runtime_completion_evidence(self) -> dict | None:
        runtime = self.runtime.current_result()
        debugging = getattr(self.validation, "debugging", None)
        if runtime is None or debugging is None:
            return runtime
        return debugging.runtime_completion_view(runtime, self.activity.revision)

    def inspect_deliveries(self) -> list[dict]:
        authority = self.plugin_development_authority
        if authority is None:
            return []
        active = authority.active
        targets = []
        if active is not None and active.status == "authorized":
            targets.append((active.target_plugin_id, active.delivery_contract, active.public_result(), active.scope_hash))
        for plugin_id in getattr(authority, "installed_source_plugin_ids", ()):
            if not any(target[0] == plugin_id for target in targets):
                targets.append((plugin_id, source_delivery_contract(self.activity.project_root, plugin_id),
                                {"status": "authorized", "workKind": "reuse-source", "grantSource": "source-install"}, None))
        if not targets:
            return []
        validation = self.validation.current_result()
        static_passed = validation is not None and validation.status == "passed" and all(
            any(check.check_id == command and check.status == "passed" for check in validation.checks)
            for command in CREATOR_COMPLETION_VALIDATIONS
        )
        reports = []
        for plugin_id, contract, authorization, scope_hash in targets:
            behavior = self.activity.current_plugin_behavior()
            if behavior and (behavior.get("pluginId") != plugin_id or behavior.get("scopeHash") != scope_hash):
                behavior = None
            reports.append(delivery_report(
                root=self.activity.project_root, plugin_id=plugin_id, contract=contract,
                authorization=authorization, revision=self.activity.revision,
                static_passed=static_passed, runtime=self._runtime_completion_evidence(),
                layout=self.runtime.current_layout(), behavior=behavior,
                final=self._delivery_review_run_id == self.activity.run_id or self.activity.finishing,
                verification_mode=self.verification_mode,
            ))
        return reports

    def review(self, candidate: str) -> CompletionDecision:
        recovery_decision = self._review_recovery()
        if recovery_decision is not None:
            return recovery_decision
        decision = self._review_debugging(candidate)
        if decision is None:
            decision = self._review(candidate)
        self._delivery_review_run_id = self.activity.run_id
        reports = self.inspect_deliveries()
        if not reports:
            return decision
        self.activity.record_plugin_deliveries(reports)
        incomplete = [report for report in reports if not delivery_status_satisfies_mode(
            report["delivery"]["status"], self.verification_mode,
        )]
        if not incomplete:
            if self.verification_mode == "static_only" and decision.accepted:
                notice = "当前静态验证通过；Runtime / 浏览器行为未由 Creator 验证。"
                return CompletionDecision(True, decision.text.rstrip() + ("" if notice in decision.text else "\n\n" + notice),
                                          completion=decision.completion, reason=decision.reason)
            return decision
        debugging = getattr(self.validation, "debugging", None)
        if debugging is not None and debugging.active:
            debugging.final_state = "blocked"
            debugging.reason = "plugin_delivery_incomplete"
        blockers = "；".join(
            f"{report['pluginId']}: " + "；".join(report["delivery"]["blockers"])
            for report in incomplete
        )
        text = "插件尚未交付完成。状态：blocked。" + "；".join(
            f"{report['pluginId']} 已达到 {report['delivery']['lastSuccessfulStage']}"
            for report in incomplete
        ) + f"。{blockers}。已写入的修改已保留。"
        self.activity.record_verification({
            "status": "changed-unverified", "projectRevision": self.activity.revision,
            "runtimeStatus": "not-run" if self.verification_mode == "static_only" else (self.runtime.current_result() or {}).get("runtimeStatus", "unavailable"),
            "verificationMode": self.verification_mode, "auditAttempts": self.repair_state.repair_rounds,
            "checks": [self._check("plugin-delivery", False, blockers)],
        })
        # Ending a blocked run is not a successful delivery (the result reads this receipt).
        terminal = (
            any(token in candidate.lower() for token in ("blocked", "尚未", "未完成", "无法完成"))
            or (self.verification_mode == "static_only" and all(
                (report["deliveryScope"] == "source-only" or report["delivery"]["stages"]["composed"]) and report["verification"]["static"] == "pass"
                for report in reports))
            or self.repair_state.limit_reached
            or (self.run_control is not None and self.run_control.blocked)
        )
        return CompletionDecision(terminal, text, None if terminal else (
            "Finish only the missing delivery obligations within current authorization. "
            "Inspect fresh composition, compose the Plugin, validate, inspect_runtime_errors and "
            "inspect_runtime_layout; run verify_ui_plugin_behavior for declared interactions. "
            "Do not repeat successful work or invent placement types. Evidence: " + json.dumps(reports, ensure_ascii=False)
        ))

    def _review_debugging(self, candidate: str) -> CompletionDecision | None:
        validation = self.validation.current_result()
        debugging = getattr(self.validation, "debugging", None)
        if debugging is not None and debugging.diagnostic_scope_pending and self.activity.revision == 0:
            return CompletionDecision(
                False, "修复目标尚未确定。",
                "Select the user-requested debuggingTargetId or ask_user_question when ambiguous; observation grants no repair scope.",
                completion="blocked", reason="debugging_target_required",
            )
        if debugging is None or not debugging.active:
            return None

        def stop(state: str, reason: str, text: str, completion: CompletionStatus) -> CompletionDecision:
            debugging.final_state, debugging.reason = state, reason
            self.activity.record_verification({
                "status": "failed", "projectRevision": self.activity.revision,
                "verificationMode": self.verification_mode,
                "auditAttempts": self.repair_state.repair_rounds,
                "checks": [self._check("debugging-targets", False, reason)],
            })
            return CompletionDecision(True, text, completion=completion, reason=reason)

        def retry(reason: str, feedback: str) -> CompletionDecision:
            self.repair_state.record_result(self.activity.revision, passed=False)
            if self.repair_state.limit_reached:
                return stop("unresolved_after_limit", reason,
                            "已达到现有自动修复上限，合法修改已保留；目标诊断或必要验证仍未解决。", "failed")
            debugging.final_state, debugging.reason = None, reason
            return CompletionDecision(False, "目标诊断或必要验证尚未解决，修改已保留。", feedback,
                                      completion="blocked", reason=reason)

        if self.run_control is not None and self.run_control.blocked:
            return stop("blocked", "scope_or_integrity_blocker",
                        self.run_control.render_blocker_response(), "blocked")
        mode = "clean" if debugging.clean_requested else "delta"
        if validation is None:
            return retry("current_validation_required",
                         f"Call validate_creator_changes(mode='{mode}') for the current revision. "
                         "Reuse bound targets; do not repeat discovery or enlarge repair scope.")
        failure = validation.failure_semantics or {}
        if validation.status != "passed":
            if failure.get("automaticRepairAllowed") is False:
                return stop("blocked", "outside_scope_or_workspace_integrity",
                            "诊断仍存在，但当前验证证据不允许自动修复；修改已保留，未跨越任务范围。", "blocked")
            return retry("current_validation_failed",
                         "Repair only introduced or explicitly requested diagnostics in their named owner files. "
                         f"Validate mode='{mode}' again. Evidence: " + json.dumps(validation.to_dict(), ensure_ascii=False))
        differential = validation.differential
        if differential is None or not differential.current_available or differential.status != "available":
            return stop("blocked", "diagnostic_set_unavailable", "缺少当前完整静态诊断，无法确认目标已解决。", "blocked")
        remaining = [item for item in differential.current_diagnostics
                     if any(debugging.static_matches(item, target) for target in debugging.targets.values())]
        if debugging.clean_requested:
            remaining = list(differential.current_diagnostics)
        scope = self.validation.scope
        scope_layers = set(getattr(scope, "taskChangeLayers", ()))
        scope_resources = set(getattr(scope, "scopeResources", ()))
        if remaining:
            layers = {change_layer_for_path(item.path, project_root=self.activity.project_root) for item in remaining}
            resources = set(resource_keys_for_paths([item.path for item in remaining],
                                                    project_root=self.activity.project_root))
            if (None in layers or (scope_layers and not layers.issubset(scope_layers))
                    or (scope_resources and not resources.issubset(scope_resources))):
                return stop("blocked", "target_outside_scope", "目标诊断位于当前可修复范围之外；未跨层修改。", "blocked")
            return retry("target_diagnostic_remaining",
                         "Delta pass does not resolve the requested existing error. Read and repair only these "
                         "current owner files; unrelated unchanged errors are warnings. Validate the next revision: "
                         + json.dumps([item.to_dict() for item in remaining], ensure_ascii=False))

        runtime = self._runtime_completion_evidence()
        if debugging.runtime_targets and self.verification_mode == "static_only":
            return stop("blocked", "runtime_evidence_not_offered",
                        "当前环境仅支持静态验证，无法确认 Runtime 目标已解决。", "blocked")
        runtime_verified = False
        if self.verification_mode == "static_and_runtime":
            if runtime is None or runtime.get("runtimeStatus") in {"stale", "unavailable"}:
                return stop("blocked", "fresh_runtime_evidence_required",
                            "静态目标已检查，但缺少当前版本最新 Runtime 证据；修改已保留。", "committed_unverified")
            if debugging.runtime_targets and debugging.runtime_differential(self.runtime.current_result(), self.activity.revision) is None:
                return stop("blocked", "runtime_differential_unavailable",
                            "缺少当前完整 Runtime 诊断或修复前基线，无法确认目标和回归状态。", "blocked")
            if runtime.get("runtimeStatus") != "passed" or runtime.get("compositionFresh") is not True:
                layers = set(runtime_failure_layers(runtime))
                resources = {f"plugin:{item['pluginId']}" for item in runtime.get("currentErrors", [])
                             if item.get("pluginId") and item.get("kind") in {"plugin-render", "plugin-activation"}}
                if (not layers or (scope_layers and not layers.issubset(scope_layers))
                        or (scope_resources and not resources.issubset(scope_resources))):
                    return stop("blocked", "runtime_failure_outside_scope",
                                "当前 Runtime 故障超出任务范围或归属不明确；未跨层修改。", "blocked")
                introduced = (runtime.get("runtimeDebuggingDifferential") or {}).get("introducedRuntimeDiagnostics", [])
                return retry("introduced_runtime_regression" if introduced else "runtime_target_remaining",
                             "Repair only fresh, source-attributed, in-scope Runtime diagnostics. Read the implicated "
                             "owner and nearest contract; do not rediscover all Plugins. Validate then inspect Runtime: "
                             + json.dumps(runtime, ensure_ascii=False))
            runtime_verified = True
        no_change = not self.activity.snapshot()["files"]
        if not no_change:
            # Keep the existing Host gate authoritative for geometry, Service
            # checks and every other development completion obligation.
            decision = self._review(candidate)
            if not decision.accepted:
                debugging.final_state, debugging.reason = None, "host_completion_pending"
                return decision
            if self.activity.snapshot().get("verification", {}).get("status") not in {
                "changed-and-verified", "changed-and-statically-verified",
            }:
                debugging.final_state, debugging.reason = "blocked", "host_completion_unverified"
                return CompletionDecision(True, decision.text, completion="committed_unverified",
                                          reason=debugging.reason)
        debugging.final_state = "unchanged_preexisting" if no_change else "resolved"
        debugging.reason = "current_goal_already_satisfied" if no_change else "resolved_target_diagnostic"
        self.activity.record_verification({
            "status": "no-project-change" if no_change else
                       "changed-and-verified" if runtime_verified else "changed-and-statically-verified",
            "projectRevision": self.activity.revision, "verificationMode": self.verification_mode,
            "runtimeStatus": "passed" if runtime_verified else "not-run",
            "auditAttempts": self.repair_state.repair_rounds,
            "checks": [*self.activity.snapshot().get("verification", {}).get("checks", []),
                       self._check("debugging-targets", True, debugging.reason)],
        })
        if self.service_authorization_finalizer is not None:
            self.service_authorization_finalizer.complete_current_applied()
        if debugging.runtime_targets:
            runtime_difference = debugging.runtime_differential(self.runtime.current_result(), self.activity.revision)
            unchanged = (runtime_difference or {}).get("unchangedPreexistingRuntimeDiagnostics", [])
            if unchanged:
                warning = f"工作区仍有 {len(unchanged)} 个任务开始前已存在的无关 Runtime 错误，本次未修复。"
                candidate = candidate.rstrip() + "\n\n" + warning
        return CompletionDecision(True, self._with_workspace_warning(candidate, validation),
                                  completion="already_satisfied" if no_change else "success",
                                  reason=debugging.reason)

    def _review_recovery(self) -> CompletionDecision | None:
        recovery = self.recovery
        if recovery is None:
            return None
        recovery._ensure_run()
        evidence = recovery.evidence
        if evidence.status == "inactive":
            return None
        if evidence.status == "blocked":
            return CompletionDecision(True, "恢复被阻塞：历史记录或当前文件已发生变化，未覆盖后续修改。",
                                      completion="blocked", reason=evidence.reason)
        # Recovery semantics apply to recovery-only mutations. Mixed authoring
        # continues through the existing development verification boundary.
        if not recovery.is_recovery_only():
            return None
        if evidence.status == "needs_user_input":
            return CompletionDecision(True, "尚未执行恢复：请明确要恢复的历史修改及完整范围。",
                                      completion="needs_user_input", reason=evidence.reason)
        if not recovery.current_recovery_matches():
            recovery._conflict("CREATOR_UNDO_CONFLICT")
            return CompletionDecision(True, "恢复后文件再次发生变化，无法确认当前状态；已保留后续修改。",
                                      completion="blocked", reason="recovery_conflict")
        validation = self.validation.current_result()
        passed = validation is not None and validation.status == "passed" and (
            validation.revision == self.activity.revision
        ) and all(any(check.check_id == command and check.status == "passed"
                      and check.revision == self.activity.revision for check in validation.checks)
                  for command in CREATOR_COMPLETION_VALIDATIONS)
        if not passed:
            failed = validation is not None and validation.status == "failed" and (
                validation.revision == self.activity.revision
            )
            evidence.final_state = "blocked" if failed else "pending_validation"
            evidence.reason = "recovery_validation_failed" if failed else "recovery_validation_required"
            self.activity.record_verification({
                "status": "failed", "projectRevision": self.activity.revision,
                "verificationMode": self.verification_mode, "runtimeStatus": "not-run",
                "auditAttempts": self.repair_state.repair_rounds,
                "checks": [self._check("recovery-validation", False, evidence.reason)],
            })
            if failed:
                return CompletionDecision(True, "恢复已执行，但当前版本静态验证失败；已保留恢复结果。",
                                          completion="blocked", reason=evidence.reason)
            return CompletionDecision(False, "恢复已执行，当前版本尚未通过静态验证。",
                                      "Recovery has completed. Run validate_creator_changes for the current revision; "
                                      "reuse the transaction evidence and do not repeat undo. If validation failed, "
                                      "report the failure without overwriting later edits.",
                                      completion="blocked", reason=evidence.reason)
        evidence.final_state = evidence.status
        evidence.reason = None
        self.activity.record_verification({
            "status": "changed-and-statically-verified" if self.activity.snapshot()["files"] else "no-project-change",
            "projectRevision": self.activity.revision, "verificationMode": self.verification_mode,
            "runtimeStatus": "not-run", "auditAttempts": self.repair_state.repair_rounds,
            "checks": [self._check("recovery-validation", True, f"revision={self.activity.revision}")],
        })
        text = ("已恢复历史修改，当前版本静态验证通过。Runtime / 浏览器行为未验证。"
                if evidence.status == "recovered" else
                "该历史修改已恢复，当前版本静态验证通过。Runtime / 浏览器行为未验证。")
        return CompletionDecision(True, self._with_workspace_warning(text, validation),
                                  completion=evidence.status)

    def _review(self, candidate: str) -> CompletionDecision:
        if self.run_control is not None and self.run_control.blocked:
            return CompletionDecision(
                True,
                self.run_control.render_blocker_response(),
            )
        receipt = self.activity.snapshot()
        if not receipt["files"]:
            development = (
                self.plugin_development_authority.active
                if self.plugin_development_authority is not None else None
            )
            if development is not None and development.status in {"adjust", "defer"}:
                text = (
                    "已结束当前开发方案；请说明调整后的需求。目标工程未因该方案修改。"
                    if development.status == "adjust" else
                    "已按你的选择暂不开发；目标工程未因该方案修改。"
                )
                self.activity.record_verification({
                    "status": "decision-no-project-change",
                    "verificationMode": self.verification_mode,
                    "projectRevision": self.activity.revision,
                    "auditAttempts": self.repair_state.repair_rounds,
                    "checks": [self._check("development-decision", True, development.status)],
                })
                return CompletionDecision(True, text)
            customized_source_id = (
                self.plugin_development_authority.blocked_customized_source_plugin_id
                if self.plugin_development_authority is not None else None
            )
            if customized_source_id is not None:
                self.activity.record_verification({
                    "status": "no-project-change",
                    "verificationMode": self.verification_mode,
                    "projectRevision": self.activity.revision,
                    "auditAttempts": self.repair_state.repair_rounds,
                    "checks": [self._check(
                        "customized-source-boundary", True,
                        f"plugin/{customized_source_id} is customized and unselected; no project files changed.",
                    )],
                })
                return CompletionDecision(
                    True,
                    f"正式 Source Item plugin/{customized_source_id} 已安装，但源码已有定制且尚未选用。"
                    "本次请求没有授权覆盖这份定制，目标工程未修改；文件卡片尚未挂载，也未运行 Mock 或浏览器验证。"
                    "如需继续，请明确选择保留定制并修改该 Plugin，或先恢复正式 Source 版本再组合使用。",
                )
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
                                    "已应用的服务授权需要通过当前宿主环境验证。",
                                )
                            ],
                        }
                    )
                    return CompletionDecision(
                        False,
                        "无法确认请求已经完成：当前服务授权尚未完成最终验证。",
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
                                    "宿主环境报告：语义操作未产生变更；"
                                    f"来源={semantic_noop.get('source', 'unknown')}；"
                                    f"原因={semantic_noop.get('reason', 'already-satisfied')}。"
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
            commissioned_development = (
                self.plugin_development_authority is not None
                and self.plugin_development_authority.intent in {"explicit", "conditional"}
            )
            if commissioned_development or (not is_clarification and not is_declared_read_only):
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
                                "本次运行没有产生项目文件变更，开发委托尚未完成。"
                                if commissioned_development else
                                "本次运行没有产生项目文件变更，也未声明为只读任务。",
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
                    "Continue implementing the requested change. "
                    + (
                        "The user commissioned Plugin development; inspect existing capabilities "
                        "and call prepare_ui_plugin_development for the bound grant."
                        if commissioned_development else
                        "If the request is genuinely read-only, respond again starting with "
                        "[creator-verification:read-only]."
                    )
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
                            "本次运行没有产生项目文件变更。",
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
                        if item.check_id == command
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
                            "当前修改版本尚无通过的验证结果："
                            f"{self.activity.revision}。"
                        )
                    ),
                )
            )

        if validation is None or validation.status != "passed" or any(
            check["status"] != "passed" for check in checks
        ):
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
                        "当前修改已保留，但 Creator 环境发现了超出本轮自动修复范围的工作区完整性问题。"
                        "为保持任务边界，本轮未跨层修改源码；"
                        f"归因：{attribution}。请先单独处理该问题，或明确将它纳入本次任务范围。"
                    ),
                )
            text = (
                "无法确认本次插件开发已经完成：当前修改版本尚未通过 Creator 环境的 "
                "verify:ui 和类型检查（typecheck）。修改已保留，请根据最新验证结果继续修复。"
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

        runtime = self._runtime_completion_evidence()
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
                    "当前 Runtime 目标已解决，且没有新引入的 Runtime 诊断。"
                    if runtime_passed and runtime.get("runtimeDebuggingDifferential") is not None
                    else "与当前 AppUIModel 哈希对应的最新运行时证据中没有未解决错误。"
                    if runtime_passed
                    else "最新运行时证据明确表明当前状态与请求不符。"
                    if fresh_runtime_contradiction
                    else f"运行时状态={runtime_status}；目前没有最新证据表明存在矛盾。"
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
        if runtime_passed and any(item.get("path", "").endswith("app-ui/app-ui.json") for item in receipt["files"]):
            try:
                model_path = self.activity.project_root / agent_ui_source_path(self.activity.project_root, "app-ui/app-ui.json").lstrip("/")
                fixed_geometry = has_fixed_geometry(json.loads(model_path.read_text()).get("root", {}))
            except (OSError, ValueError):
                fixed_geometry = False
            layout = self.runtime.current_layout()
            intent_checks = (layout or {}).get("intentChecks", [])
            tail_geometry = (runtime.get("verificationTail") or {}).get("geometryVerification", {})
            if fixed_geometry and tail_geometry.get("status") != "passed" and (not layout or layout.get("compositionFresh") is not True or not intent_checks
                                   or any(check.get("status") != "passed" for check in intent_checks)):
                self.activity.record_verification({
                    "status": "changed-unverified", "verificationMode": self.verification_mode,
                    "runtimeStatus": "failed" if any(check.get("status") == "failed" for check in intent_checks) else "unavailable",
                    "projectRevision": self.activity.revision, "auditAttempts": self.repair_state.repair_rounds,
                    "checks": [*checks, self._check("runtime-layout-intent", False, json.dumps(intent_checks))],
                })
                return CompletionDecision(False, "布局修改已保留，但固定尺寸尚未通过当前 Runtime 几何验证，任务未完成。",
                    None if self.repair_state.limit_reached else "Call inspect_runtime_layout and compare intentChecks with measured rectangles. Repair fresh contradictions; do not claim completion from AppUIModel sizes alone.")
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
                    "无法确认本次插件开发已经完成：最新运行时几何证据与请求的界面组合位置或尺寸不一致。"
                    "修改已保留，请继续修复并重新验证。"
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
                    "无法确认本次插件开发已经完成：最新运行时组合状态与当前启用的插件挂载不一致，"
                    f"仍有 {len(composition_failures)} 个实例检查未通过。修改已保留，请继续修复并重新验证。"
                )
            else:
                text = (
                    "无法确认本次插件开发已经完成：最新运行时证据中仍有 "
                    f"{len(current_errors)} 个未解决的问题。修改已保留，请继续修复并重新验证。"
                )
            changed_paths = [
                str(item.get("path"))
                for item in receipt.get("files", [])
                if isinstance(item, dict) and isinstance(item.get("path"), str)
            ]
            if change_layers_for_paths(changed_paths, project_root=self.activity.project_root) == ("composition",):
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
                        "当前界面组合修改已保留，但最新运行时证据显示问题位于当前任务范围之外，"
                        "或无法可靠判断问题归属。该问题不代表可以在本轮跨层修改；"
                        "请单独处理，或明确将相关修复纳入本次任务范围。"
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
            "无法确认本次插件开发已经完成：缺少最新运行时证据，或现有证据早于最后一次源码/界面组合修改。"
            "修改已保留，待运行时产生最新观察后再重新验证。"
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
