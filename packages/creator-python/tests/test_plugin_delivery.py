from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.domain_agent.completion_gate import CreatorDevelopmentCompletionGate
from agent_ui_creator.domain_tools import create_project_control_tools
from agent_ui_creator.domain_tools.capabilities import component_navigation
from agent_ui_creator.plugin_development.authority import PluginDevelopmentAuthority
from agent_ui_creator.plugin_development.admission_middleware import PluginDevelopmentAdmissionMiddleware
from agent_ui_creator.plugin_development.delivery import PluginAuthoringContract, delivery_report
from agent_ui_creator.plugin_development.behavior import parse_behavior_result, create_plugin_behavior_tool
from agent_ui_creator.repair import CreatorRepairState

CONTRACT = {
    "capability": "checklist", "renderingCategory": "panel", "placement": "declared default",
    "lifecycle": "local-ui-only", "dependencies": [], "reusedComponents": [],
    "verificationMethod": "runtime", "interactions": [],
}


def write(root, path, value):
    file = root / path
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(value) if isinstance(value, dict) else value)


def artifacts(root, *, source_root=""):
    prefix = source_root + "/" if source_root else ""
    if source_root:
        write(root, ".agent-ui/project.json", {"version": "2", "sourceRoot": source_root})
    for name, text in {"manifest.json": {"id": "checklist"}, "definition.ts": "export default {};",
                       "index.tsx": "export const Checklist = () => null;"}.items():
        write(root, prefix + "plugins/checklist/" + name, text)
    return prefix


def report(root, **overrides):
    args = dict(root=root, plugin_id="checklist", contract=CONTRACT,
                authorization={"status": "authorized", "workKind": "create-plugin"},
                revision=3, static_passed=True,
                runtime={"runtimeStatus": "passed", "compositionVerified": True},
                layout={"compositionFresh": True, "instances": [{"instanceId": "checklist-main", "rect": {"x": 0, "width": 280, "height": 300}}]})
    args.update(overrides)
    return delivery_report(**args)


def compose(root, prefix="", enabled=True):
    write(root, prefix + "app-ui/app-ui.json", {"root": {"type": "slot", "plugins": [
        {"id": "checklist-main", "pluginId": "checklist", "enabled": enabled}]}})


class CatalogClient:
    async def inspect_ui_project(self):
        return {"appUIModel": {"hash": "a" * 64}, "pluginAssets": [],
                "authoringTargetCatalog": {"candidates": [{"id": "right-panel"}]}}
    async def inspect_agent_ui_sources(self):
        return {"stateHash": "b" * 64, "items": [{"id": "plugin/generated-file-message",
                "description": "File output display", "status": "available", "availableVersion": "1"}]}


def test_d01_formal_source_discovery_does_not_grant_development(tmp_path):
    authority = PluginDevelopmentAuthority(tmp_path, thread_id="thread")
    authority.begin_task(task_id="task", request_id="request", user_message="把文件展示出来", intent="needs_decision")
    tool = next(t for t in create_project_control_tools(CatalogClient()) if t.name == "inspect_ui_capabilities")
    output = asyncio.run(tool.ainvoke({}))
    result = json.loads(output)["result"]
    assert result["sources"]["items"][0]["id"] == "plugin/generated-file-message"
    PluginDevelopmentAdmissionMiddleware(authority)._observe("inspect_ui_capabilities", {}, output)
    assert authority.active is None and not authority.can_expose_create
    assert not list(tmp_path.iterdir())


@pytest.mark.parametrize("source_root", ["", "src/custom-agent"])
def test_d02_lifecycle_requires_registration_composition_and_current_evidence(tmp_path, source_root):
    prefix = artifacts(tmp_path, source_root=source_root)
    assert report(tmp_path)["delivery"]["lastSuccessfulStage"] == "created"
    write(tmp_path, prefix + "plugins/registry.generated.ts", 'import("./checklist/definition")')
    assert report(tmp_path)["delivery"]["lastSuccessfulStage"] == "registered"
    compose(tmp_path, prefix)
    assert report(tmp_path, runtime=None)["delivery"]["lastSuccessfulStage"] == "composed"
    assert report(tmp_path)["delivery"]["status"] == "completed"
    assert report(tmp_path, static_passed=False)["delivery"]["status"] == "blocked"


def test_d03_composition_failure_recovery_and_disabled_parent(tmp_path):
    artifacts(tmp_path)
    write(tmp_path, "plugins/registry.generated.ts", 'import("./checklist/definition")')
    compose(tmp_path, enabled=False)
    assert report(tmp_path)["delivery"]["status"] == "blocked"
    compose(tmp_path)
    assert report(tmp_path)["delivery"]["status"] == "completed"
    write(tmp_path, "app-ui/app-ui.json", {"root": {"type": "slot", "plugins": [
        {"id": "parent", "pluginId": "parent", "enabled": False, "slots": {
            "composer": [{"id": "checklist-main", "pluginId": "checklist"}]}}]}})
    assert not report(tmp_path)["delivery"]["stages"]["composed"]


def test_d04_component_navigation_and_behavior_parity(tmp_path):
    write(tmp_path, "src/widgets/ExistingComposer.tsx", "export function ExistingComposer() {}")
    components, complete = component_navigation(tmp_path)
    assert complete and components[0]["preserveBehavior"] == ["send", "stop", "attachment", "draft"]
    assert components[0]["behaviorVerified"] is False
    artifacts(tmp_path)
    write(tmp_path, "plugins/registry.generated.ts", 'import("./checklist/definition")')
    compose(tmp_path)
    contract = {**CONTRACT, "verificationMethod": "browser-test", "interactions": ["send", "stop", "attachment", "draft"]}
    assert report(tmp_path, contract=contract)["delivery"]["status"] == "blocked"
    assert report(tmp_path, contract=contract, behavior={"status": "passed", "revision": 2})["delivery"]["status"] == "blocked"
    assert report(tmp_path, contract=contract, behavior={"status": "passed", "revision": 3})["delivery"]["status"] == "completed"


def test_runtime_geometry_contradiction_and_stale_observation(tmp_path):
    artifacts(tmp_path)
    write(tmp_path, "plugins/registry.generated.ts", 'import("./checklist/definition")')
    compose(tmp_path)
    contract = {**CONTRACT, "geometry": [{"instanceId": "checklist-main", "property": "width", "expected": 300}]}
    assert report(tmp_path, contract=contract)["verification"]["geometry"] == "not-passed"
    assert report(tmp_path, layout={"compositionFresh": False})["delivery"]["status"] == "blocked"


def test_static_only_reports_scope_without_runtime_or_browser_claims(tmp_path):
    artifacts(tmp_path)
    write(tmp_path, "plugins/registry.generated.ts", 'import("./checklist/definition")')
    compose(tmp_path)
    contract = {**CONTRACT, "verificationMethod": "browser-test", "interactions": ["check"]}
    result = report(tmp_path, contract=contract, runtime=None, layout=None,
                    verification_mode="static_only")
    assert result["delivery"]["status"] == "statically-verified"
    assert result["delivery"]["stages"]["verified"] is False
    assert result["verification"] == {
        "static": "pass", "runtime": "not-run", "geometry": "not-run", "interaction": "not-run",
    }
    assert report(tmp_path, contract=contract, runtime=None, layout=None,
                  verification_mode="static_and_runtime")["delivery"]["status"] == "blocked"


def test_unmatched_message_renderer_needs_runtime_but_not_a_dom_rectangle(tmp_path):
    artifacts(tmp_path)
    write(tmp_path, "plugins/checklist/manifest.json", {"id": "checklist", "requiresRenderScope": True,
                                                    "data": {"messageUI": True}})
    write(tmp_path, "plugins/registry.generated.ts", 'import("./checklist/definition")')
    compose(tmp_path)
    contract = {**CONTRACT, "renderingCategory": "semantic-slot"}
    result = report(tmp_path, contract=contract, layout=None)
    assert result["delivery"]["status"] == "completed"
    assert result["verification"]["geometry"] == "not-applicable"
    assert report(tmp_path, contract=contract, runtime=None, layout=None)["delivery"]["status"] == "blocked"


def test_headless_application_does_not_require_dom_geometry(tmp_path):
    artifacts(tmp_path)
    write(tmp_path, "plugins/checklist/manifest.json", {"id": "checklist", "capabilities": ["headless"]})
    write(tmp_path, "plugins/registry.generated.ts", 'import("./checklist/definition")')
    write(tmp_path, "app-ui/app-ui.json", {"applicationPlugins": [
        {"id": "checklist-main", "pluginId": "checklist", "enabled": True}],
        "root": {"type": "slot", "plugins": []}})
    result = report(tmp_path, contract={**CONTRACT, "renderingCategory": "application"}, layout=None)
    assert result["delivery"]["status"] == "completed"
    assert result["verification"]["geometry"] == "not-applicable"


@pytest.mark.parametrize("status", ["skipped", "failed", "timedOut"])
def test_browser_report_never_accepts_skips_or_failures(status):
    output = json.dumps({"suites": [{"specs": [{"title": "[delivery:checklist] send", "tests": [
        {"status": "expected", "results": [{"status": status}]}]}]}]})
    assert parse_behavior_result(output, plugin_id="checklist", interactions=["send"])["status"] == "failed"


def test_browser_report_requires_every_named_interaction_and_no_flakes():
    output = json.dumps({"suites": [{"specs": [{"title": "[delivery:checklist] send", "tests": [
        {"status": "expected", "results": [{"status": "passed"}]}]}]}]})
    assert parse_behavior_result(output, plugin_id="checklist", interactions=["send"])["status"] == "passed"
    assert parse_behavior_result(output, plugin_id="checklist", interactions=["send", "stop"])["status"] == "failed"
    assert parse_behavior_result("{}", plugin_id="checklist", interactions=[])["status"] == "failed"


def test_contract_rejects_nonfinite_geometry_and_unknown_category():
    with pytest.raises(ValidationError):
        PluginAuthoringContract.model_validate({**CONTRACT, "renderingCategory": "relative-below"})
    with pytest.raises(ValidationError):
        PluginAuthoringContract.model_validate({**CONTRACT, "geometry": [{"instanceId": "x", "property": "width", "expected": float("nan")}]})


def test_index_does_not_follow_external_symlinks_or_claim_truncated_absence(tmp_path):
    write(tmp_path, "a.tsx", "")
    (tmp_path / "external").symlink_to(tmp_path.parent, target_is_directory=True)
    entries, complete = component_navigation(tmp_path, limit=1)
    assert len(entries) == 1 and complete is False


def test_completion_gate_overrides_model_success_for_unmounted_plugin(tmp_path):
    artifacts(tmp_path)
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("run")
    activity.capture_before_content("/plugins/checklist/index.tsx", None)
    activity.touch("/plugins/checklist/index.tsx")
    authority = SimpleNamespace(active=SimpleNamespace(
        status="authorized", target_plugin_id="checklist", delivery_contract=CONTRACT, scope_hash="scope",
        public_result=lambda: {"status": "authorized", "workKind": "create-plugin"}),
        blocked_customized_source_plugin_id=None)
    validation = SimpleNamespace(current_result=lambda: SimpleNamespace(status="passed", checks=[], differential=None))
    runtime = SimpleNamespace(current_result=lambda: None, current_layout=lambda: None)
    gate = CreatorDevelopmentCompletionGate(activity=activity, validation=validation, runtime=runtime,
        repair_state=CreatorRepairState(), verification_mode="static_only", plugin_development_authority=authority)
    decision = gate.review("已经全部完成")
    assert decision.accepted is False
    assert "尚未交付完成" in decision.text
    assert activity.snapshot()["pluginDeliveries"][0]["delivery"]["status"] == "blocked"


def test_behavior_tool_runs_real_project_browser_tests(tmp_path):
    """Exercise the Host runner/report boundary; this is not a live Creator evaluation."""
    import shutil
    from pathlib import Path
    repository = Path(__file__).resolve().parents[3]
    modules = repository / "apps/creator-workbench/node_modules"
    if not Path("/Applications/Google Chrome.app").exists() or not (modules / "@playwright/test").exists():
        pytest.skip("Requires local Chrome and installed workspace Playwright")
    shutil.copytree(Path(__file__).parent / "fixtures/delivery-browser", tmp_path, dirs_exist_ok=True)
    (tmp_path / "node_modules").symlink_to(modules, target_is_directory=True)
    # The fixture uses CJS; the public tool supports this standard Playwright config too.
    write(tmp_path, "package.json", {"devDependencies": {"@playwright/test": "installed"}})
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("browser")
    active = SimpleNamespace(status="authorized", target_plugin_id="checklist", scope_hash="scope",
                             delivery_contract={**CONTRACT, "interactions": ["check", "filter", "reset"]})
    tool = create_plugin_behavior_tool(authority=SimpleNamespace(active=active), activity=activity)
    result = json.loads(asyncio.run(tool.ainvoke({})))
    assert result["ok"] is True, result
    assert result["result"]["status"] == "passed", activity.snapshot()["validations"]
    assert len(result["result"]["passedTests"]) == 3
    assert activity.current_plugin_behavior()["revision"] == activity.revision


def test_fixed_layout_intent_uses_measured_track_width():
    from agent_ui_creator.runtime_diagnostics.layout_intent import layout_intent_checks
    layout = {"type": "row", "nodeRef": "l0", "sizes": ["280px", "1fr"], "children": [
        {"type": "panel", "nodeRef": "l1"}, {"type": "panel", "nodeRef": "l2"}]}
    assert layout_intent_checks(layout, [])[0]["status"] == "unavailable"
    assert layout_intent_checks(layout, [{"nodeRef": "l1", "rect": {"width": 1000}}])[0]["status"] == "failed"
    assert layout_intent_checks(layout, [{"nodeRef": "l1", "rect": {"width": 280}}])[0]["status"] == "passed"


def test_source_delivery_requires_installer_lock_and_composition(tmp_path):
    from agent_ui_creator.plugin_development.delivery import source_delivery_contract
    artifacts(tmp_path)
    write(tmp_path, "plugins/registry.generated.ts", 'import("./checklist/definition")')
    compose(tmp_path)
    authorization = {"status": "authorized", "workKind": "reuse-source", "grantSource": "source-install"}
    contract = source_delivery_contract(tmp_path, "checklist")
    assert report(tmp_path, authorization=authorization, contract=contract)["delivery"]["status"] == "blocked"
    write(tmp_path, ".agent-ui/source-lock.json", {"items": {"plugin/checklist": {"files": {}}}})
    assert report(tmp_path, authorization=authorization, contract=contract)["delivery"]["status"] == "completed"


def test_fixed_sidebar_checks_conversation_position_too():
    from agent_ui_creator.runtime_diagnostics.layout_intent import layout_intent_checks
    layout = {"type": "row", "nodeRef": "l0", "sizes": ["280px", "1fr"], "children": [
        {"type": "panel", "nodeRef": "l1"}, {"type": "panel", "nodeRef": "l2"}]}
    evidence = [{"nodeRef": "l1", "rect": {"x": 0, "width": 280}},
                {"nodeRef": "l2", "rect": {"x": 0, "width": 900}}]
    assert layout_intent_checks(layout, evidence)[-1]["status"] == "failed"
    evidence[-1]["rect"]["x"] = 280
    assert all(check["status"] == "passed" for check in layout_intent_checks(layout, evidence))
