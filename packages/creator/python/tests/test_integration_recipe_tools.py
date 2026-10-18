from __future__ import annotations
import asyncio
import json
from agent_ui_creator.domain_tools import create_operator_tools
from agent_ui_creator.domain_agent.tool_policy import ALLOWED_INSPECT_READ_ONLY_TOOLS, SIDE_EFFECT_TOOL_NAMES

class Client:
    def __init__(self):
        self.calls = []
    async def plan_agent_ui_integration(self, options):
        self.calls.append(("plan", options))
        return {"status": "target-required", "host": {"candidates": ["src/App.vue"]}}
    async def apply_agent_ui_integration(self, recipe):
        self.calls.append(("apply", recipe))
        return {"status": "passed", "changedPaths": []}
    async def prepare_agent_ui_integration_asset(self, recipe):
        self.calls.append(("prepare", recipe))
        return {"status": "ready", "target": "public/agent-ui.js", "changedPaths": []}
    async def verify_agent_ui_integration(self, recipe):
        self.calls.append(("verify", recipe))
        return {"status": "passed", "changedPaths": []}

def test_recipe_is_forwarded_unchanged_and_apply_is_unavailable_in_read_only_mode():
    client = Client()
    tools = {tool.name: tool for tool in create_operator_tools(client)}
    recipe = {"id": "host-owned", "edits": []}
    for name, args in [("plan_agent_ui_integration", {}), ("apply_agent_ui_integration", {"recipe": recipe}), ("verify_agent_ui_integration", {"recipe": recipe})]:
        assert json.loads(asyncio.run(tools[name].ainvoke(args)))["ok"]
    assert client.calls == [("plan", {}), ("apply", recipe), ("verify", recipe)]
    assert "plan_agent_ui_integration" in ALLOWED_INSPECT_READ_ONLY_TOOLS
    assert "verify_agent_ui_integration" in ALLOWED_INSPECT_READ_ONLY_TOOLS
    assert "apply_agent_ui_integration" not in ALLOWED_INSPECT_READ_ONLY_TOOLS
    assert "apply_agent_ui_integration" in SIDE_EFFECT_TOOL_NAMES


def test_json_encoded_integration_arguments_are_decoded_without_changing_the_host_recipe():
    client = Client()
    tools = {tool.name: tool for tool in create_operator_tools(client)}
    recipe = {"id": "host-owned", "edits": []}
    for name, args in [
        ("plan_agent_ui_integration", {"options": json.dumps({"targetFile": "src/App.vue"})}),
        ("apply_agent_ui_integration", {"recipe": json.dumps(recipe)}),
        ("verify_agent_ui_integration", {"recipe": json.dumps(recipe)}),
    ]:
        assert json.loads(asyncio.run(tools[name].ainvoke(args)))["ok"]
    assert client.calls == [("plan", {"targetFile": "src/App.vue"}), ("apply", recipe), ("verify", recipe)]


def test_asset_only_request_forwards_the_original_recipe_without_full_apply():
    client = Client()
    tools = {tool.name: tool for tool in create_operator_tools(client)}
    recipe = {"id": "host-owned", "edits": [], "manualPrerequisites": [{"status": "missing"}]}
    result = json.loads(asyncio.run(tools["prepare_agent_ui_integration_asset"].ainvoke({"recipe": json.dumps(recipe)})))
    assert result["ok"]
    assert client.calls == [("prepare", recipe)]
    assert "prepare_agent_ui_integration_asset" in SIDE_EFFECT_TOOL_NAMES
    assert "prepare_agent_ui_integration_asset" not in ALLOWED_INSPECT_READ_ONLY_TOOLS


def test_plan_reference_preserves_exact_code_bytes_and_rejects_unknown_ids():
    recipe = {"id": "canonical-plan", "edits": [{"file": "src/App.vue", "before": None, "after": "<template><main /></template>\n"}]}
    class Planned(Client):
        async def plan_agent_ui_integration(self, options):
            return {"status": "planned", "integrationRecipe": recipe}
    client = Planned()
    tools = {tool.name: tool for tool in create_operator_tools(client)}
    planned = json.loads(asyncio.run(tools["plan_agent_ui_integration"].ainvoke({})))
    reference = planned["result"]["recipeReference"]
    for name in ["apply_agent_ui_integration", "prepare_agent_ui_integration_asset", "verify_agent_ui_integration"]:
        assert json.loads(asyncio.run(tools[name].ainvoke({"recipe": reference})))["ok"]
    assert all(value == recipe for _, value in client.calls)
    assert all(value["edits"][0]["after"].endswith("\n") for _, value in client.calls)
    before = len(client.calls)
    unknown = json.loads(asyncio.run(tools["apply_agent_ui_integration"].ainvoke({"recipe": {"id": "not-seen"}})))
    assert unknown["error"]["code"] == "INTEGRATION_RECIPE_REFERENCE_MISSING"
    assert len(client.calls) == before


def test_bound_host_edits_are_not_recorded_as_producer_source_edits(tmp_path):
    from unittest.mock import MagicMock
    client = Client()
    client.project_root = tmp_path
    (tmp_path / ".agent-ui").mkdir()
    (tmp_path / ".agent-ui" / "consumer.json").write_text('{"schemaVersion":1,"hostRelativePath":".."}')
    recorder = MagicMock()
    tools = {tool.name: tool for tool in create_operator_tools(client, activity=recorder)}
    recipe = {"id": "host-owned", "edits": [{"file": "src/App.vue", "before": None, "after": "<template />\n"}]}
    assert json.loads(asyncio.run(tools["apply_agent_ui_integration"].ainvoke({"recipe": recipe})))["ok"]
    recorder.capture_before.assert_not_called()
    recorder.touch.assert_not_called()


def test_bound_host_completion_uses_host_checks_without_accepting_failed_or_mixed_source_work(tmp_path):
    from types import SimpleNamespace
    from unittest.mock import Mock
    from agent_ui_creator.activity import CreatorActivityRecorder
    from agent_ui_creator.domain_agent.completion_gate import CreatorDevelopmentCompletionGate
    from agent_ui_creator.repair import CreatorRepairState
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("host-integration")
    gate = CreatorDevelopmentCompletionGate(activity=activity, validation=SimpleNamespace(current_result=lambda: None), runtime=Mock(), repair_state=CreatorRepairState())
    passed = {"status": "passed", "recipeId": "host-plan", "changedPaths": ["src/App.vue"], "checks": [{"id": "consumer-boundary", "passed": True}]}
    activity.record_bound_host_integration(passed, phase="apply")
    assert gate._review("Host integration completed; browser not checked.").accepted
    assert activity.snapshot()["files"] == []
    assert activity.snapshot()["verification"]["runtimeStatus"] == "not-run"
    activity.record_bound_host_integration({**passed, "status": "failed", "checks": [{"id": "consumer-boundary", "passed": False}]}, phase="verify")
    assert not gate._review("Host integration completed.").accepted
    activity.record_bound_host_integration(passed, phase="apply")
    activity.capture_before("source.ts")
    (tmp_path / "source.ts").write_text("export const changed = true;\n")
    activity.touch("source.ts")
    assert not gate._review("Host and source completed.").accepted
    activity.begin("next-run")
    assert activity.bound_host_integration is None


def test_bound_producer_uses_operator_ui_verification_without_a_tool_dependency_script(tmp_path):
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    from agent_ui_creator.activity import CreatorActivityRecorder
    from agent_ui_creator.validation import CreatorValidationService
    (tmp_path / ".agent-ui").mkdir()
    (tmp_path / ".agent-ui/consumer.json").write_text('{"schemaVersion":1,"hostRelativePath":".."}')
    (tmp_path / "package.json").write_text('{"scripts":{"typecheck":"tsc --noEmit"}}')
    operator = SimpleNamespace(verify_ui_project=AsyncMock(return_value={"status": "passed", "errors": []}))
    runner = SimpleNamespace(execute_known_command=AsyncMock())
    service = CreatorValidationService(project_root=tmp_path, activity=CreatorActivityRecorder(tmp_path), operator=operator, runner=runner)
    result = asyncio.run(service._execute_validation("pnpm verify:ui"))
    assert result.exit_code == 0
    operator.verify_ui_project.assert_awaited_once()
    runner.execute_known_command.assert_not_awaited()
    (tmp_path / "package.json").write_text('{"scripts":{"verify:ui":"custom verifier"}}')
    asyncio.run(service._execute_validation("pnpm verify:ui"))
    runner.execute_known_command.assert_awaited_once_with("pnpm verify:ui")
