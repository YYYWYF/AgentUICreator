from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

from agent_ui_creator.debugging import DebuggingEvidence
from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.app_ui_model import ProjectMutationCoordinator
from agent_ui_creator.domain_agent.change_scope import ChangeScopeMetrics
from agent_ui_creator.observability import CreatorRunLogger
from agent_ui_creator.project_control.errors import ProjectControlError
import agent_ui_creator.validation.attribution as validation_attribution
from agent_ui_creator.validation import (
    CREATOR_COMPLETION_VALIDATIONS,
    CommandExecutionResult,
    CreatorValidationService,
    create_validation_tool,
)


class FakeValidationRunner:
    def __init__(self, results=None, before=None):
        self.results = list(results or [])
        self.before = before
        self.calls = []

    async def execute_known_command(self, command):
        self.calls.append(command)
        if self.before is not None:
            self.before(command)
        if self.results:
            return self.results.pop(0)
        return CommandExecutionResult("", 0, False)


def test_registry_sync_error_is_recoverable_tool_diagnostic():
    class BrokenRegistryService:
        debugging = DebuggingEvidence()
        activity = SimpleNamespace(run_id="test", revision=0)
        def _synchronize_run_state(self):
            pass
        def current_result(self):
            return None
        async def validate(self, mode="delta"):
            raise ProjectControlError(
                "CONTROL_OPERATION_FAILED", "Plugin manifest is invalid",
                {"cause": "data.state must be boolean"},
            )

    tool = create_validation_tool(BrokenRegistryService())
    payload = json.loads(asyncio.run(tool.ainvoke({})))

    assert payload == {"ok": False, "error": {
        "code": "CONTROL_OPERATION_FAILED",
        "message": "Plugin manifest is invalid",
        "details": {"cause": "data.state must be boolean"},
    }}


def validation_service(tmp_path, runner, *, logger=None, scope=None):
    activity = CreatorActivityRecorder(tmp_path, logger=logger)
    activity.begin("validation-run")
    return (
        CreatorValidationService(
            project_root=tmp_path,
            activity=activity,
            runner=runner,
            scope=scope,
        ),
        activity,
    )


def test_validation_runs_known_commands(tmp_path):
    runner = FakeValidationRunner()
    service, activity = validation_service(tmp_path, runner)

    result = asyncio.run(service.validate())

    assert runner.calls == list(CREATOR_COMPLETION_VALIDATIONS)
    assert result.status == "passed"
    assert result.failure_semantics is None
    assert [check.source for check in result.checks] == ["executed", "executed"]
    assert len(activity.snapshot()["validations"]) == 2


def test_validation_result_cached_for_same_revision(tmp_path):
    runner = FakeValidationRunner()
    service, _activity = validation_service(tmp_path, runner)

    first = asyncio.run(service.validate())
    second = asyncio.run(service.validate())

    assert first.status == second.status == "passed"
    assert runner.calls == list(CREATOR_COMPLETION_VALIDATIONS)
    assert [check.source for check in second.checks] == ["cached", "cached"]


def test_source_edit_invalidates_validation(tmp_path):
    runner = FakeValidationRunner()
    service, activity = validation_service(tmp_path, runner)
    asyncio.run(service.validate())

    activity.capture_before_content("plugins/example.ts", None)
    activity.touch("plugins/example.ts")
    result = asyncio.run(service.validate())

    assert result.revision == 1
    assert result.status == "passed"
    assert runner.calls == [
        *CREATOR_COMPLETION_VALIDATIONS,
        *CREATOR_COMPLETION_VALIDATIONS,
    ]


def test_plugin_declaration_edit_synchronizes_generated_registry_before_validation(tmp_path):
    plugin = tmp_path / "plugins/example"
    plugin.mkdir(parents=True)
    (plugin / "definition.ts").write_text("updated", encoding="utf-8")
    registry = tmp_path / "plugins/registry.generated.ts"
    registry.write_text("old registry", encoding="utf-8")

    class RegistryControl:
        calls = []

        async def synchronize_plugin_registry(self, *, expected_source_hash):
            self.calls.append(expected_source_hash)
            registry.write_text("new registry", encoding="utf-8")
            return {"changed": True, "path": "plugins/registry.generated.ts", "pluginIds": ["example"]}

    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("registry-sync")
    control = RegistryControl()
    runner = FakeValidationRunner()
    service = CreatorValidationService(
        project_root=tmp_path,
        activity=activity,
        runner=runner,
        project_control=control,
        mutation_coordinator=ProjectMutationCoordinator(),
    )
    asyncio.run(service.ensure_baseline())
    activity.capture_before_content("plugins/example/definition.ts", "original")
    activity.touch("plugins/example/definition.ts")

    result = asyncio.run(service.validate())
    assert result.status == "passed"
    assert result.revision == 2
    assert len(control.calls) == 1
    assert activity.mutation_paths[-1] == "plugins/registry.generated.ts"
    assert registry.read_text(encoding="utf-8") == "new registry"
    asyncio.run(service.validate())
    assert len(control.calls) == 1


def test_failed_validation_returns_diagnostics_not_run_error(tmp_path):
    runner = FakeValidationRunner(
        [
            CommandExecutionResult("Type error in index.tsx", 2, False),
            CommandExecutionResult("", 0, False),
        ]
    )
    service, _activity = validation_service(tmp_path, runner)
    tool = create_validation_tool(service)

    payload = json.loads(asyncio.run(tool.ainvoke({})))

    assert payload["ok"] is True
    assert payload["result"]["status"] == "failed"
    assert payload["result"]["checks"][0]["output"] == "Type error in index.tsx"
    assert payload["result"]["failureSemantics"] == {
        "category": "workspace_integrity",
        "attribution": "unknown",
        "taskScope": [],
        "taskScopeResources": [],
        "scopeResources": [],
        "changedResources": [],
        "failureLayers": [],
        "changedPaths": [],
        "automaticRepairAllowed": False,
        "automaticCrossLayerRepairAllowed": False,
        "recovery": "stop_and_report_blocker",
    }


def test_validation_tool_exposes_introduced_diagnostics_before_long_check_output():
    class Validation:
        status = "failed"
        revision = 8
        differential = None

        def to_dict(self):
            return {
                "revision": 8,
                "status": "failed",
                "checks": [{"command": "pnpm verify:ui", "status": "passed", "output": "x" * 8000}],
                "newDiagnostics": [{"path": "src/agent-ui/agent-ui/i18n/locales/en-US.ts",
                                    "code": "TS2741", "message": "Missing checklist locale."}],
                "failureSemantics": {"automaticRepairAllowed": True},
            }

    class Service:
        repair_state = SimpleNamespace(to_dict=lambda: {})
        debugging = DebuggingEvidence()
        activity = SimpleNamespace(run_id="test", revision=8)
        def _synchronize_run_state(self):
            pass
        def current_result(self):
            return None
        def metrics(self):
            return {"debuggingMetrics": {}}

        async def validate(self, mode="delta"):
            return Validation()

    raw = asyncio.run(create_validation_tool(Service()).ainvoke({}))
    payload = json.loads(raw)

    assert raw.index('"newDiagnostics"') < raw.index('"checks"')
    assert '"TS2741"' in raw[:4096]
    assert payload["result"]["checks"][0]["output"] == "x" * 8000
    assert "named files" in payload["result"]["repairGuidance"]


def test_composition_validation_blocker_is_unrelated_and_not_auto_repairable(
    tmp_path,
):
    runner = FakeValidationRunner(
        [
            CommandExecutionResult(
                "PLUGIN_CHILD_SLOT_CONTRACT_INVALID: plugins/conversation-surface/manifest.json",
                1,
                False,
            )
        ]
    )
    service, activity = validation_service(tmp_path, runner)
    activity.capture_before_content("app-ui/app-ui.json", "before")
    (tmp_path / "app-ui").mkdir()
    (tmp_path / "app-ui/app-ui.json").write_text("after", encoding="utf-8")
    activity.touch("app-ui/app-ui.json")

    result = asyncio.run(service.validate())

    assert result.failure_semantics == {
        "category": "workspace_integrity",
        "attribution": "unrelated",
        "taskScope": ["composition"],
        "taskScopeResources": ["app-ui-model"],
        "scopeResources": ["app-ui-model"],
        "changedResources": ["app-ui-model"],
        "failureLayers": ["plugin_behavior"],
        "changedPaths": ["app-ui/app-ui.json"],
        "automaticRepairAllowed": False,
        "automaticCrossLayerRepairAllowed": False,
        "recovery": "stop_and_report_blocker",
    }


def test_validation_failure_in_changed_source_is_attributed_to_current_run(tmp_path):
    runner = FakeValidationRunner(
        [CommandExecutionResult("plugins/sample/index.tsx(1,1): error", 1, False)]
    )
    service, activity = validation_service(tmp_path, runner)
    (tmp_path / "plugins/sample").mkdir(parents=True)
    activity.capture_before_content("plugins/sample/index.tsx", None)
    (tmp_path / "plugins/sample/index.tsx").write_text("broken", encoding="utf-8")
    activity.touch("plugins/sample/index.tsx")

    result = asyncio.run(service.validate())

    assert result.failure_semantics["attribution"] == "introduced"
    assert result.failure_semantics["taskScope"] == ["plugin_behavior"]
    assert result.failure_semantics["automaticRepairAllowed"] is True


def test_validation_failure_in_committed_scope_is_attributed_in_scope(tmp_path):
    runner = FakeValidationRunner(
        [CommandExecutionResult("(conversation-surface): invalid", 1, False)]
    )
    scope = ChangeScopeMetrics(
        taskChangeLayers=["plugin_behavior"],
        scopeResources=["plugin:conversation-surface"],
    )
    service, _activity = validation_service(tmp_path, runner, scope=scope)

    result = asyncio.run(service.validate())

    assert result.failure_semantics["attribution"] == "in_scope"
    assert result.failure_semantics["automaticRepairAllowed"] is True


def test_validation_failure_in_same_change_layer_but_different_resource_is_unrelated(
    tmp_path,
):
    runner = FakeValidationRunner(
        [CommandExecutionResult("plugins/bar/manifest.json: invalid", 1, False)]
    )
    service, activity = validation_service(tmp_path, runner)
    (tmp_path / "plugins/foo").mkdir(parents=True)
    activity.capture_before_content("plugins/foo/index.tsx", None)
    (tmp_path / "plugins/foo/index.tsx").write_text("changed", encoding="utf-8")
    activity.touch("plugins/foo/index.tsx")

    result = asyncio.run(service.validate())

    assert result.failure_semantics["attribution"] == "unrelated"
    assert result.failure_semantics["taskScope"] == ["plugin_behavior"]
    assert result.failure_semantics["scopeResources"] == ["plugin:foo"]
    assert result.failure_semantics["changedResources"] == ["plugin:foo"]
    assert result.failure_semantics["failureLayers"] == ["plugin_behavior"]
    assert result.failure_semantics["automaticRepairAllowed"] is False


def test_validation_becomes_stale_if_revision_changes(tmp_path):
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("stale-validation")

    def mutate_after_first_command(_command):
        if activity.revision == 0:
            activity.capture_before_content("plugins/external.ts", None)
            activity.touch("plugins/external.ts")

    runner = FakeValidationRunner(before=mutate_after_first_command)
    service = CreatorValidationService(
        project_root=tmp_path,
        activity=activity,
        runner=runner,
    )

    result = asyncio.run(service.validate())

    assert result.status == "stale"
    assert result.revision == 0
    assert activity.revision == 1
    assert runner.calls == ["pnpm verify:ui"]


def test_attribution_failure_preserves_evidence_and_finishes_validation(
    tmp_path, monkeypatch
):
    logger = CreatorRunLogger(tmp_path)
    logger.begin(run_id="validation-evidence")
    runner = FakeValidationRunner(
        [
            CommandExecutionResult("verify output", 1, False),
            CommandExecutionResult("typecheck output", 0, False),
        ]
    )
    service, _activity = validation_service(tmp_path, runner, logger=logger)

    def fail_attribution(**_kwargs):
        raise RuntimeError("synthetic attribution failure")

    monkeypatch.setattr(
        validation_attribution,
        "attribute_validation_failure",
        fail_attribution,
    )

    result = asyncio.run(service.validate())

    assert result.status == "failed"
    assert result.failure_semantics == {
        "category": "workspace_integrity",
        "attribution": "unknown",
        "taskScope": [],
        "taskScopeResources": [],
        "scopeResources": [],
        "changedResources": [],
        "failureLayers": [],
        "changedPaths": [],
        "automaticRepairAllowed": False,
        "automaticCrossLayerRepairAllowed": False,
        "recovery": "stop_and_report_blocker",
    }
    assert service.latest_evidence is result.evidence
    assert [check.to_dict() for check in result.checks] == [
        {
            "command": "pnpm verify:ui",
            "status": "failed",
            "exitCode": 1,
            "output": "verify output",
            "truncated": False,
            "revision": 0,
            "source": "executed",
        },
        {
            "command": "pnpm typecheck",
            "status": "passed",
            "exitCode": 0,
            "output": "typecheck output",
            "truncated": False,
            "revision": 0,
            "source": "executed",
        },
    ]
    entries = [
        json.loads(line)
        for line in logger.path.read_text(encoding="utf-8").splitlines()
    ]
    event_types = [entry["type"] for entry in entries]
    assert event_types.index("host_validation_evidence") < event_types.index(
        "validation_attribution_degraded"
    ) < event_types.index("host_validation_finished")
    evidence = next(
        entry["data"]
        for entry in entries
        if entry["type"] == "host_validation_evidence"
    )
    assert evidence["checks"][0]["output"] == "verify output"
    degraded = next(
        entry["data"]
        for entry in entries
        if entry["type"] == "validation_attribution_degraded"
    )
    assert degraded == {
        "revision": 0,
        "errorType": "RuntimeError",
        "message": "synthetic attribution failure",
    }


def test_validation_reports_two_round_repair_limit(tmp_path):
    runner = FakeValidationRunner(
        [CommandExecutionResult("still broken", 1, False)] * 6
    )
    service, activity = validation_service(tmp_path, runner)
    tool = create_validation_tool(service)

    asyncio.run(tool.ainvoke({}))
    for revision in (1, 2):
        activity.capture_before_content(f"plugins/repair-{revision}.ts", None)
        activity.touch(f"plugins/repair-{revision}.ts")
        payload = json.loads(asyncio.run(tool.ainvoke({})))

    assert payload["result"]["repairRounds"] == 2
    assert payload["result"]["maxRepairRounds"] == 2
    assert payload["result"]["repairLimitReached"] is True


def test_managed_composition_failure_keeps_project_scope(tmp_path):
    (tmp_path / ".agent-ui").mkdir()
    (tmp_path / ".agent-ui/project.json").write_text(json.dumps({
        "mode": "platform", "sourceRoot": "src/agent-ui",
    }))
    runner = FakeValidationRunner([
        CommandExecutionResult("", 0, False),
        CommandExecutionResult("app-ui/app-ui.json: invalid", 1, False),
        CommandExecutionResult("", 0, False),
    ])
    service, activity = validation_service(tmp_path, runner)
    path = "src/agent-ui/app-ui/app-ui.json"
    asyncio.run(service.ensure_baseline())
    (tmp_path / path).parent.mkdir(parents=True)
    activity.capture_before_content(path, None)
    (tmp_path / path).write_text("{}")
    activity.touch(path)

    result = asyncio.run(service.validate())

    assert result.failure_semantics["taskScope"] == ["composition"]
    assert result.failure_semantics["changedResources"] == ["app-ui-model"]
    assert result.failure_semantics["attribution"] == "introduced"


def test_optional_build_is_not_replaced_by_cached_static_validation(tmp_path):
    runner = FakeValidationRunner()
    service, activity = validation_service(tmp_path, runner)
    tool = create_validation_tool(service)
    asyncio.run(tool.ainvoke({}))
    runner.results = [CommandExecutionResult("build failed", 1, False)]
    payload = json.loads(asyncio.run(tool.ainvoke({"includeBuild": True})))
    assert runner.calls[-1] == "pnpm build"
    assert payload["result"]["status"] == "failed"
    assert payload["result"]["checks"][-1]["command"] == "pnpm build"
    previous_calls = list(runner.calls)
    asyncio.run(tool.ainvoke({"includeBuild": True}))
    assert runner.calls == previous_calls
    # Omitting the flag later cannot turn a failed build into completion success.
    payload = json.loads(asyncio.run(tool.ainvoke({})))
    assert payload["result"]["status"] == "failed"
    assert runner.calls == previous_calls
