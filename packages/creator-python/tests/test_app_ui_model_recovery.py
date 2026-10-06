import asyncio
import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from langchain.agents.middleware import ModelRequest
from langchain_core.messages import HumanMessage

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.app_ui_model import AppUIModelMutationService, ProjectMutationCoordinator
from agent_ui_creator.app_ui_model.recovery_tool import create_app_ui_model_recovery_tool
from agent_ui_creator.domain_state import DomainObservationContext, DomainObservationError
from agent_ui_creator.domain_agent.grounding_convergence import CompositionGroundingConvergenceMiddleware
from agent_ui_creator.domain_tools import create_project_control_tools
from agent_ui_creator.files import read_creator_file_state
from agent_ui_creator.minimal_agent.path_policy import MinimalAgentPathPolicy, PolicyFilesystemBackend
from agent_ui_creator.project_control import ProjectControlError

HASH = "a" * 64
COVERAGE = ("composition.model", "composition.layout", "composition.slots", "composition.instances", "capability.inventory", "capability.composition-summary")


def test_recovery_requires_current_invalid_observation():
    observations = DomainObservationContext()
    with pytest.raises(DomainObservationError, match="Inspect invalid"):
        observations.require_recovery(revision=0, raw_hash=HASH)
    observations.observe_recovery({"status": "valid", "rawHash": HASH}, revision=0)
    assert observations.recovery_observation is None
    observations.observe_recovery({"status": "schema_invalid", "rawHash": HASH}, revision=0)
    observations.require_recovery(revision=0, raw_hash=HASH)
    with pytest.raises(DomainObservationError):
        observations.require_recovery(revision=1, raw_hash=HASH)
    with pytest.raises(DomainObservationError):
        observations.require_recovery(revision=0, raw_hash="b" * 64)


def test_repaired_model_requires_composition_refresh():
    observations = DomainObservationContext()
    observations.recovery_requires_composition = True
    observations.observe_app_ui_model(hash=HASH, revision=1, source="inspect_app_ui_model")
    with pytest.raises(DomainObservationError):
        observations.require_app_ui_model_hash(current_revision=1)
    observations.observe_composition_snapshot(hash=HASH, revision=1, coverage=COVERAGE)
    assert observations.require_app_ui_model_hash(current_revision=1) == HASH


def test_recovery_lane_filters_and_rejects_other_layer_tools(tmp_path):
    setup(tmp_path, object())
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.development())
    observations = DomainObservationContext()
    observations.recovery_pending = True
    middleware = CompositionGroundingConvergenceMiddleware(observations, backend)
    names = ["read_file", "inspect_app_ui_model_source", "repair_app_ui_model", "mutate_app_ui_model", "edit_file", "mutate_ui_plugin_source"]
    request = ModelRequest(model=Mock(), messages=[HumanMessage(content="修复页面")], tools=[SimpleNamespace(name=name) for name in names])
    assert [tool.name for tool in middleware._request(request).tools] == names[:3]
    assert middleware._before_tool_call(SimpleNamespace(tool_call={"name": "edit_file", "args": {"file_path": "/app-ui/app-ui.json"}}))[-1] is True
    observations.recovery_pending = False
    observations.recovery_requires_composition = True
    request.tools.append(SimpleNamespace(name="inspect_ui_project"))
    assert [tool.name for tool in middleware._request(request).tools] == ["inspect_ui_project"]


def setup(tmp_path, client):
    (tmp_path / ".agent-ui").mkdir()
    (tmp_path / ".agent-ui/project.json").write_text('{"mode":"platform","sourceRoot":"agent-ui"}')
    (tmp_path / "agent-ui/app-ui").mkdir(parents=True)
    (tmp_path / "agent-ui/plugins").mkdir()
    (tmp_path / "agent-ui/app-ui/app-ui.json").write_text("{")
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("recovery-test")
    service = AppUIModelMutationService(project_root=tmp_path, project_control=client, activity=activity, mutation_coordinator=ProjectMutationCoordinator())
    return service, activity


def test_repair_captures_revision_and_clears_old_observations(tmp_path):
    class Client:
        async def repair_app_ui_model(self, **kwargs):
            model = tmp_path / "agent-ui/app-ui/app-ui.json"
            model.write_text('{"root":{"type":"slot","plugins":[]}}')
            return {"changed": True, "changedPaths": ["agent-ui/app-ui/app-ui.json"], "appUIModel": {"afterHash": read_creator_file_state(tmp_path, "agent-ui/app-ui/app-ui.json").hash}}
    service, activity = setup(tmp_path, Client())
    observations = DomainObservationContext()
    observations.observe_recovery({"status": "syntax_invalid", "rawHash": HASH}, revision=0)
    tool = create_app_ui_model_recovery_tool(service, observations)
    result = json.loads(asyncio.run(tool.ainvoke({"expectedRawHash": HASH, "candidateModel": {"root": {"type": "slot", "plugins": []}}})))
    assert result["ok"] is True
    assert activity.revision == 1
    assert observations.recovery_observation is None
    assert observations.recovery_requires_composition
    with pytest.raises(DomainObservationError):
        observations.require_app_ui_model_hash(current_revision=1)


def test_candidate_replan_is_bounded_and_does_not_write(tmp_path):
    class Client:
        calls = 0
        async def repair_app_ui_model(self, **kwargs):
            self.calls += 1
            raise ProjectControlError("APP_UI_MODEL_REPAIR_CANDIDATE_INVALID", "bad candidate")
    client = Client()
    service, activity = setup(tmp_path, client)
    observations = DomainObservationContext()
    observations.observe_recovery({"status": "schema_invalid", "rawHash": HASH}, revision=0)
    tool = create_app_ui_model_recovery_tool(service, observations)
    async def invoke():
        return [json.loads(await tool.ainvoke({"expectedRawHash": HASH, "candidateModel": {}})) for _ in range(3)]
    results = asyncio.run(invoke())
    assert client.calls == 2
    assert results[-1]["error"]["code"] == "APP_UI_MODEL_REPAIR_REPLAN_LIMIT"
    assert activity.revision == 0
    assert (tmp_path / "agent-ui/app-ui/app-ui.json").read_text() == "{"


def test_invalid_inspection_enters_recovery_and_grants_only_source_observation(tmp_path):
    class Client:
        async def inspect_ui_project(self, **kwargs):
            raise ProjectControlError("APP_UI_MODEL_INVALID", "invalid")
        async def inspect_app_ui_model_source(self):
            return {"status": "syntax_invalid", "rawHash": HASH, "source": "{", "diagnostics": []}
    client = Client()
    _, activity = setup(tmp_path, client)
    observations = DomainObservationContext()
    tools = {tool.name: tool for tool in create_project_control_tools(client, observations=observations, activity=activity)}
    asyncio.run(tools["inspect_ui_project"].ainvoke({"view": "composition"}))
    assert observations.recovery_pending
    asyncio.run(tools["inspect_app_ui_model_source"].ainvoke({}))
    observations.require_recovery(revision=0, raw_hash=HASH)
    assert observations.current_hash(current_revision=0) is None


def test_new_recovery_wire_fixtures_and_transport(tmp_path, monkeypatch):
    from pathlib import Path
    from agent_ui_creator.project_control import ProjectControlClient
    client = ProjectControlClient(project_root=tmp_path)
    fixtures = Path(__file__).resolve().parents[3] / "contracts/creator/fixtures/project-control"
    manifest = json.loads((fixtures / "manifest.json").read_text())
    for group, entries in manifest.items():
        for entry in entries:
            if not any(part in entry["file"] for part in ("repair-", "repair_app_ui_model", "recovery-", "inspect_app_ui_model_source")):
                continue
            value = json.loads((fixtures / entry["file"]).read_text())
            try:
                if group == "requests":
                    client._validate_protocol(value, request=True)
                else:
                    client._validate_result(entry["operation"], value)
                accepted = True
            except ProjectControlError:
                accepted = False
            assert accepted == entry["valid"], entry["file"]
    monkeypatch.setattr(client, "_ensure_fixed_runtime", lambda: None)
    sent = []
    async def execute(payload):
        request = json.loads(payload)
        sent.append(request)
        result = json.loads((fixtures / f'{request["operation"]}.result.json').read_text())
        return json.dumps({"ok": True, "result": result}).encode(), b"", 0
    monkeypatch.setattr(client, "_execute", execute)
    async def invoke():
        await client.inspect_app_ui_model_source()
        await client.repair_app_ui_model(expected_raw_hash=HASH, candidate_model={"root": {"type": "slot", "plugins": []}})
    asyncio.run(invoke())
    assert sent[0] == {"operation": "inspect_app_ui_model_source", "input": {}}
    assert sent[1]["input"]["expectedRawHash"] == HASH
    assert sent[1]["operation"] == "repair_app_ui_model"


def test_blocked_workspace_does_not_accept_reinspection_as_authority():
    observations = DomainObservationContext()
    observations.recovery_blocked = "APP_UI_MODEL_REPAIR_WORKSPACE_INTEGRITY"
    observations.observe_recovery({"status": "schema_invalid", "rawHash": HASH}, revision=0)
    with pytest.raises(DomainObservationError) as raised:
        observations.require_recovery(revision=0, raw_hash=HASH)
    assert raised.value.code == observations.recovery_blocked


def test_recovery_commit_then_fresh_snapshot_exposes_validation(tmp_path):
    from langchain_core.messages import ToolMessage
    setup(tmp_path, object())
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.development())
    observations = DomainObservationContext()
    observations.observe_recovery({"status": "schema_invalid", "rawHash": HASH}, revision=0)
    middleware = CompositionGroundingConvergenceMiddleware(observations, backend)
    middleware._before_tool_call(SimpleNamespace(tool_call={"name": "repair_app_ui_model", "args": {}}))
    middleware._after_tool_call("repair_app_ui_model", {}, ToolMessage(content='{"ok":true,"result":{}}', tool_call_id="repair"))
    observations.observe_composition_snapshot(hash=HASH, revision=0, coverage=COVERAGE)
    request = ModelRequest(model=Mock(), messages=[HumanMessage(content="修复")], tools=[SimpleNamespace(name="validate_creator_changes")])
    current = middleware._request(request)
    assert [tool.name for tool in current.tools] == ["validate_creator_changes"]
    assert "validate_creator_changes now" in current.messages[-1].content


def test_conflicting_external_write_requires_invalid_source_refresh(tmp_path):
    class Client:
        async def repair_app_ui_model(self, **kwargs):
            (tmp_path / "agent-ui/app-ui/app-ui.json").write_text("external invalid")
            raise ProjectControlError("APP_UI_MODEL_RECOVERY_HASH_CONFLICT", "stale")
    service, _ = setup(tmp_path, Client())
    observations = DomainObservationContext()
    observations.observe_recovery({"status": "syntax_invalid", "rawHash": HASH}, revision=0)
    tool = create_app_ui_model_recovery_tool(service, observations)
    result = json.loads(asyncio.run(tool.ainvoke({"expectedRawHash": HASH, "candidateModel": {}})))
    assert result["error"]["code"] == "APP_UI_MODEL_RECOVERY_HASH_CONFLICT"
    assert observations.recovery_pending
    assert not observations.recovery_requires_composition
    assert observations.recovery_observation is None
