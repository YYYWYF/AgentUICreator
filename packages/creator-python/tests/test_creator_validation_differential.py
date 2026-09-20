from __future__ import annotations

import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

from langchain_core.messages import ToolMessage

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.domain_agent.completion_gate import (
    CreatorDevelopmentCompletionGate,
)
from agent_ui_creator.domain_agent.change_scope import ScopeAwareRecoveryGuard
from agent_ui_creator.repair import CreatorRepairState
from agent_ui_creator.validation import (
    CommandExecutionResult,
    CreatorValidationService,
    parse_typescript_diagnostics,
)


class QueueRunner:
    def __init__(self, results: list[CommandExecutionResult]):
        self.results = list(results)
        self.calls: list[str] = []

    async def execute_known_command(self, command: str) -> CommandExecutionResult:
        self.calls.append(command)
        if self.results:
            return self.results.pop(0)
        return CommandExecutionResult("", 0, False)


def _diagnostic(path: str, code: str, message: str) -> str:
    return f"{path}(12,34): error {code}: {message}"


def _service(
    tmp_path: Path,
    results: list[CommandExecutionResult],
) -> tuple[CreatorValidationService, CreatorActivityRecorder, QueueRunner]:
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("differential-run")
    runner = QueueRunner(results)
    return (
        CreatorValidationService(
            project_root=tmp_path,
            activity=activity,
            runner=runner,
        ),
        activity,
        runner,
    )


def test_differential_baseline_and_post_clean(tmp_path):
    service, _activity, runner = _service(
        tmp_path,
        [
            CommandExecutionResult("", 0, False),
            CommandExecutionResult("verify ok", 0, False),
            CommandExecutionResult("", 0, False),
        ],
    )

    result = asyncio.run(service.validate())

    assert result.status == "passed"
    assert result.differential.to_dict() == {
        "validationMode": "delta",
        "differentialStatus": "available",
        "validationBaselineCaptured": True,
        "baselineAvailable": True,
        "baselineDiagnosticCount": 0,
        "currentDiagnosticCount": 0,
        "newDiagnosticCount": 0,
        "unchangedDiagnosticCount": 0,
        "resolvedDiagnosticCount": 0,
        "newDiagnostics": [],
        "unchangedDiagnostics": [],
        "resolvedDiagnostics": [],
        "currentDiagnostics": [],
    }
    assert runner.calls == [
        "pnpm typecheck",
        "pnpm verify:ui",
        "pnpm typecheck",
    ]


def test_unchanged_existing_errors_pass_delta_with_workspace_warning(tmp_path):
    existing = "\n".join(
        [
            _diagnostic("framework/contracts/ui-plugin.ts", "TS2322", "Existing A"),
            _diagnostic("tests/legacy.ts", "TS2345", "Existing B"),
            _diagnostic("scripts/ui-project/app-ui-operations.ts", "TS7006", "Existing C"),
        ]
    )
    service, activity, _runner = _service(
        tmp_path,
        [
            CommandExecutionResult(existing, 1, False),
            CommandExecutionResult("", 0, False),
            CommandExecutionResult(existing, 1, False),
        ],
    )

    result = asyncio.run(service.validate(mode="delta"))

    assert result.status == "passed"
    assert result.failure_semantics is None
    assert result.differential.to_dict()["newDiagnosticCount"] == 0
    assert result.differential.to_dict()["unchangedDiagnosticCount"] == 3
    assert result.workspace_warning["diagnosticCount"] == 3
    assert result.workspace_warning["message"].startswith("工作区仍有 3 个")


def test_new_error_is_introduced_evidence_and_is_repairable(tmp_path):
    existing = _diagnostic("framework/contracts/ui-plugin.ts", "TS2322", "Existing")
    introduced = _diagnostic("services/conversation/contract.ts", "TS2339", "New service error")
    service, _activity, _runner = _service(
        tmp_path,
        [
            CommandExecutionResult(existing, 1, False),
            CommandExecutionResult("", 0, False),
            CommandExecutionResult("\n".join([existing, introduced]), 1, False),
        ],
    )

    result = asyncio.run(service.validate())

    assert result.status == "failed"
    assert result.failure_semantics["attribution"] == "introduced"
    assert result.failure_semantics["automaticRepairAllowed"] is True
    assert result.failure_semantics["automaticCrossLayerRepairAllowed"] is True
    assert result.failure_semantics["failureLayers"] == ["runtime_capability"]
    assert result.differential.to_dict()["newDiagnostics"] == [
        {"path": "services/conversation/contract.ts", "code": "TS2339", "message": "New service error"}
    ]


def test_repairing_introduced_error_returns_success_and_preserves_warning(tmp_path):
    existing = "\n".join(
        [
            _diagnostic("framework/contracts/ui-plugin.ts", "TS2322", "Existing A"),
            _diagnostic("tests/legacy.ts", "TS2345", "Existing B"),
        ]
    )
    introduced = _diagnostic("services/conversation/contract.ts", "TS2339", "New service error")
    service, activity, _runner = _service(
        tmp_path,
        [
            CommandExecutionResult(existing, 1, False),
            CommandExecutionResult("", 0, False),
            CommandExecutionResult("\n".join([existing, introduced]), 1, False),
            CommandExecutionResult("", 0, False),
            CommandExecutionResult(existing, 1, False),
        ],
    )
    asyncio.run(service.ensure_baseline())
    activity.capture_before_content("plugins/example/index.tsx", "before")
    (tmp_path / "plugins").mkdir(exist_ok=True)
    (tmp_path / "plugins/example").mkdir(exist_ok=True)
    (tmp_path / "plugins/example/index.tsx").write_text("after", encoding="utf-8")
    activity.touch("plugins/example/index.tsx")

    first = asyncio.run(service.validate())
    assert first.status == "failed"

    activity.capture_before_content("services/conversation/contract.ts", "broken")
    (tmp_path / "services/conversation").mkdir(parents=True, exist_ok=True)
    (tmp_path / "services/conversation/contract.ts").write_text("fixed", encoding="utf-8")
    activity.touch("services/conversation/contract.ts")
    repaired = asyncio.run(service.validate())

    assert repaired.status == "passed"
    assert repaired.differential.to_dict()["resolvedDiagnosticCount"] == 1
    assert repaired.workspace_warning["diagnosticCount"] == 2


def _request(name: str, arguments: dict[str, object], call_id: str):
    return SimpleNamespace(tool_call={"name": name, "args": arguments, "id": call_id})


def _success(call_id: str) -> ToolMessage:
    return ToolMessage(
        content=json.dumps({"ok": True, "result": {}}),
        tool_call_id=call_id,
        name="tool",
        status="success",
    )


def test_introduced_cross_layer_diagnostic_does_not_trigger_scope_guard(tmp_path):
    service, activity, runner = _service(
        tmp_path,
        [
            CommandExecutionResult("", 0, False),
        ],
    )
    guard = ScopeAwareRecoveryGuard(baseline_capture=service.ensure_baseline)
    guard.wrap_tool_call(
        _request("edit_file", {"file_path": "/plugins/foo/index.tsx"}, "plugin"),
        lambda _request: _success("plugin"),
    )
    guard.wrap_tool_call(
        _request("validate_creator_changes", {}, "validation"),
        lambda _request: ToolMessage(
            content=json.dumps(
                {
                    "ok": True,
                    "result": {
                        "failureSemantics": {
                            "category": "workspace_integrity",
                            "attribution": "introduced",
                            "automaticRepairAllowed": True,
                            "automaticCrossLayerRepairAllowed": True,
                            "recovery": "repair_in_scope",
                        }
                    },
                }
            ),
            tool_call_id="validation",
            name="tool",
            status="success",
        ),
    )

    called = []
    result = guard.wrap_tool_call(
        _request("edit_file", {"file_path": "/services/foo/contract.ts"}, "service"),
        lambda _request: called.append(True) or _success("service"),
    )

    assert result.status == "success"
    assert called == [True]
    assert runner.calls == ["pnpm typecheck"]
    assert activity.revision == 0


def test_unchanged_unrelated_baseline_diagnostic_does_not_authorize_framework_edit(
    tmp_path,
):
    existing = _diagnostic("framework/foo.ts", "TS1234", "Pre-existing")
    service, _activity, _runner = _service(
        tmp_path,
        [
            CommandExecutionResult(existing, 1, False),
            CommandExecutionResult("", 0, False),
            CommandExecutionResult(existing, 1, False),
        ],
    )
    result = asyncio.run(service.validate(mode="delta"))

    assert result.status == "passed"
    assert result.workspace_warning["diagnosticCount"] == 1
    assert result.failure_semantics is None


class _PassingRuntime:
    def current_result(self):
        return {
            "runtimeStatus": "passed",
            "currentErrors": [],
            "compositionChecks": [],
        }


def test_composition_completion_reports_seven_existing_errors_as_warning(tmp_path):
    existing = "\n".join(
        [
            _diagnostic("framework/contracts/ui-plugin.ts", "TS2322", "A"),
            _diagnostic("scripts/ui-project/app-ui-operations.ts", "TS2345", "B"),
            _diagnostic("tests/legacy-one.ts", "TS7006", "C"),
            _diagnostic("tests/legacy-two.ts", "TS2307", "D"),
            _diagnostic("framework/layout.ts", "TS2339", "E"),
            _diagnostic("scripts/registry.ts", "TS2551", "F"),
            _diagnostic("tests/legacy-three.ts", "TS2322", "G"),
        ]
    )
    service, activity, _runner = _service(
        tmp_path,
        [
            CommandExecutionResult(existing, 1, False),
            CommandExecutionResult("verify ok", 0, False),
            CommandExecutionResult(existing, 1, False),
        ],
    )
    (tmp_path / "app-ui").mkdir()
    (tmp_path / "app-ui/app-ui.json").write_text('{"conversation":true}', encoding="utf-8")
    activity.capture_before_content("app-ui/app-ui.json", '{"conversation":true}')
    (tmp_path / "app-ui/app-ui.json").write_text('{"conversation":false}', encoding="utf-8")
    activity.touch("app-ui/app-ui.json")

    result = asyncio.run(service.validate())
    gate = CreatorDevelopmentCompletionGate(
        activity=activity,
        validation=service,
        runtime=_PassingRuntime(),
        repair_state=CreatorRepairState(),
        verification_mode="static_and_runtime",
    )
    decision = gate.review("已完成会话管理删除")

    assert result.status == "passed"
    assert result.failure_semantics is None
    assert decision.accepted is True
    assert "工作区仍有 7 个" in decision.text
    assert activity.snapshot()["verification"]["status"] == "changed-and-verified"


def test_clean_mode_requires_zero_remaining_diagnostics(tmp_path):
    existing = _diagnostic("framework/foo.ts", "TS1234", "Pre-existing")
    service, activity, _runner = _service(
        tmp_path,
        [
            CommandExecutionResult(existing, 1, False),
            CommandExecutionResult("", 0, False),
            CommandExecutionResult(existing, 1, False),
            CommandExecutionResult("", 0, False),
            CommandExecutionResult("", 0, False),
        ],
    )

    failed = asyncio.run(service.validate(mode="clean"))
    activity.capture_before_content("plugins/fix.ts", "before")
    (tmp_path / "plugins").mkdir(exist_ok=True)
    (tmp_path / "plugins/fix.ts").write_text("fixed", encoding="utf-8")
    activity.touch("plugins/fix.ts")
    passed = asyncio.run(service.validate(mode="clean"))

    assert failed.status == "failed"
    assert failed.failure_semantics["attribution"] == "in_scope"
    assert passed.status == "passed"


def test_targeted_existing_diagnostic_resolves_in_delta_with_workspace_warning(
    tmp_path,
):
    baseline = "\n".join(
        [
            _diagnostic("framework/foo.ts", "TS1234", "A"),
            _diagnostic("tests/bar.ts", "TS2345", "B"),
            _diagnostic("scripts/baz.ts", "TS7006", "C"),
        ]
    )
    current = "\n".join(
        [
            _diagnostic("framework/foo.ts", "TS1234", "A"),
            _diagnostic("scripts/baz.ts", "TS7006", "C"),
        ]
    )
    service, _activity, _runner = _service(
        tmp_path,
        [
            CommandExecutionResult(baseline, 1, False),
            CommandExecutionResult("", 0, False),
            CommandExecutionResult(current, 1, False),
        ],
    )

    result = asyncio.run(service.validate(mode="delta"))
    differential = result.differential.to_dict()

    assert result.status == "passed"
    assert differential["validationMode"] == "delta"
    assert differential["baselineDiagnosticCount"] == 3
    assert differential["currentDiagnosticCount"] == 2
    assert differential["resolvedDiagnosticCount"] == 1
    assert differential["resolvedDiagnostics"] == [
        {"path": "tests/bar.ts", "code": "TS2345", "message": "B"}
    ]
    assert differential["unchangedDiagnosticCount"] == 2
    assert result.workspace_warning["diagnosticCount"] == 2


def test_unavailable_parser_fails_closed(tmp_path):
    service, _activity, _runner = _service(
        tmp_path,
        [
            CommandExecutionResult("compiler failed before diagnostics", 1, False),
            CommandExecutionResult("", 0, False),
            CommandExecutionResult("", 0, False),
        ],
    )

    result = asyncio.run(service.validate())

    assert result.status == "failed"
    assert result.differential.to_dict()["differentialStatus"] == "unavailable"
    assert result.failure_semantics["attribution"] == "unknown"
    assert result.failure_semantics["automaticRepairAllowed"] is False


def test_read_only_service_does_not_capture_baseline(tmp_path):
    service, _activity, runner = _service(tmp_path, [])

    assert service.metrics()["validationBaselineCaptured"] is False
    assert runner.calls == []


def test_first_side_effect_captures_baseline_exactly_once(tmp_path):
    service, _activity, runner = _service(
        tmp_path,
        [CommandExecutionResult("", 0, False)],
    )
    guard = ScopeAwareRecoveryGuard(baseline_capture=service.ensure_baseline)

    for index in range(3):
        guard.wrap_tool_call(
            _request(
                "edit_file",
                {"file_path": f"/plugins/foo-{index}.tsx"},
                f"edit-{index}",
            ),
            lambda request: _success(request.tool_call["id"]),
        )

    assert runner.calls == ["pnpm typecheck"]
    assert service.metrics()["validationBaselineCaptured"] is True


def test_parser_ignores_line_columns_for_fingerprint_and_normalizes_paths(tmp_path):
    first = parse_typescript_diagnostics(
        "./plugins\\foo.ts(1,2): error TS2322:  Type   'a' is not assignable",
        project_root=tmp_path,
        exit_code=1,
    )
    second = parse_typescript_diagnostics(
        "plugins/foo.ts(99,100): error TS2322: Type 'a' is not assignable",
        project_root=tmp_path,
        exit_code=1,
    )

    assert first.available is True
    assert first.diagnostics[0].fingerprint == second.diagnostics[0].fingerprint


def test_duplicate_diagnostic_occurrence_is_new_delta_and_fails(tmp_path):
    baseline = (
        "foo.ts(10,2): error TS2322: Type 'string' is not assignable to type 'number'"
    )
    post = "\n".join(
        [
            baseline,
            "foo.ts(80,2): error TS2322: Type 'string' is not assignable to type 'number'",
        ]
    )
    service, _activity, _runner = _service(
        tmp_path,
        [
            CommandExecutionResult(baseline, 1, False),
            CommandExecutionResult("verify ok", 0, False),
            CommandExecutionResult(post, 1, False),
        ],
    )

    result = asyncio.run(service.validate(mode="delta"))
    differential = result.differential.to_dict()

    assert result.status == "failed"
    assert differential["baselineDiagnosticCount"] == 1
    assert differential["currentDiagnosticCount"] == 2
    assert differential["unchangedDiagnosticCount"] == 1
    assert differential["newDiagnosticCount"] == 1
