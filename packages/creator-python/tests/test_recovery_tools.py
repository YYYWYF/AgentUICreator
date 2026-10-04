import json
from types import SimpleNamespace
from unittest.mock import Mock

from langchain.agents.middleware import ModelRequest
from langchain_core.messages import ToolMessage

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.domain_tools.recovery_tools import (
    CreatorRecoveryQueries, create_recovery_query_tools,
)
from agent_ui_creator.transactions import CreatorTransactionFileInput, CreatorTransactionStore
from agent_ui_creator.files import creator_content_hash
from agent_ui_creator.domain_agent.grounding_convergence import CompositionGroundingConvergenceMiddleware
from agent_ui_creator.domain_agent.source_grounding import SourceGroundingConvergenceMiddleware
from agent_ui_creator.domain_agent.tool_policy import (
    DomainReadToolPolicyMiddleware, DomainWriteToolPolicyMiddleware,
)
from agent_ui_creator.domain_state import DomainObservationContext
from agent_ui_creator.minimal_agent.path_policy import MinimalAgentPathPolicy, PolicyFilesystemBackend
from agent_ui_creator.model_protocol.trace import ToolProtocolMetrics
from agent_ui_creator.operations.models import CreatorAuthoringHandoff
from agent_ui_creator.domain_agent.agent import _completion_from_verification


def _record(root, run_id, files):
    store = CreatorTransactionStore(root)
    for path, _before, after in files:
        target = root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        if after is not None:
            target.write_text(after)
    store.persist_run(
        run_id=run_id, mutation_revision=1, validation_revision=None,
        files=[CreatorTransactionFileInput(*item) for item in files],
    )


def test_baseline_query_uses_saved_before_state_without_template(tmp_path):
    _record(tmp_path, "r1", [("plugins/panel.ts", "old panel", "new panel")])
    queries = CreatorRecoveryQueries(tmp_path)
    result = queries.baseline("plugins/panel.ts")
    assert result["status"] == "available"
    assert result["source"] == "creator_transaction_before"
    assert result["originalProjectBaseline"] == "not_implemented"
    assert queries.baseline("plugins/unknown.ts")["status"] == "evidence_missing"
    assert (tmp_path / "plugins/panel.ts").read_text() == "new panel"


def test_source_lock_hash_is_partial_evidence_under_configured_source_root(tmp_path):
    metadata = tmp_path / ".agent-ui"
    metadata.mkdir()
    (metadata / "project.json").write_text(json.dumps({"mode": "platform", "sourceRoot": "src/agent-ui"}))
    digest = "a" * 64
    (metadata / "source-lock.json").write_text(json.dumps({
        "sourceRoot": "src/agent-ui",
        "items": {"plugin/panel": {"version": "1", "files": {"plugins/panel/index.ts": {"sha256": digest}}}},
    }))
    queries = CreatorRecoveryQueries(tmp_path)
    found = queries.baseline("src/agent-ui/plugins/panel/index.ts")
    assert found["status"] == "partial_coverage"
    assert found["source"] == "source_lock_hash"
    assert found["sourceLockCandidates"][0]["sourceHash"] == digest
    assert "beforeContent" not in found["sourceLockCandidates"][0]
    explicit = queries.baseline("src/agent-ui/plugins/panel/index.ts", run_id="missing-run")
    assert explicit["status"] == "partial_coverage"
    assert explicit["missingTransactionRunId"] == "missing-run"
    assert queries.baseline("src/agent-ui/plugins/other.ts")["status"] == "evidence_missing"


def test_source_lock_and_transaction_before_can_confirm_saved_content(tmp_path):
    metadata = tmp_path / ".agent-ui"
    metadata.mkdir()
    (metadata / "project.json").write_text(json.dumps({"mode": "assistant", "sourceRoot": "agent-ui"}))
    (metadata / "source-lock.json").write_text(json.dumps({
        "sourceRoot": "agent-ui", "items": {"plugin/panel": {"version": "1", "files": {
            "plugins/panel/index.ts": {"sha256": creator_content_hash("original\n")},
        }}},
    }))
    path = "agent-ui/plugins/panel/index.ts"
    _record(tmp_path, "r1", [(path, "original\n", "edited\n")])
    evidence = CreatorRecoveryQueries(tmp_path).baseline(path, run_id="r1")
    assert evidence["status"] == "available"
    assert evidence["originalProjectBaseline"] == "source_lock_hash_matched_transaction_before"
    assert evidence["candidates"][0]["beforeContent"] == "original\n"


def test_scope_observation_requires_every_page_and_exact_target(tmp_path):
    files = [(f"plugins/file-{index}.ts", "old", "new") for index in range(21)]
    _record(tmp_path, "r1", files)
    queries = CreatorRecoveryQueries(tmp_path)
    last = queries.inspect("r1", page=2)
    assert last["scopeComplete"] is False
    assert queries.undo("r1", last["transactionId"], [path for path, *_ in files])["status"] == "observation_required"
    first = queries.inspect("r1", page=1)
    assert first["scopeComplete"] is True
    assert first["fileCount"] == 21
    assert queries.undo("r1", first["transactionId"], [files[0][0]])["status"] == "scope_mismatch"
    assert queries.undo("r1", first["transactionId"], [path for path, *_ in files])["status"] == "undone"


def test_targeted_diff_distinguishes_equal_length_edits_and_stale_record(tmp_path):
    _record(tmp_path, "r1", [("plugins/panel.ts", "panel A\n", "panel B\n")])
    queries = CreatorRecoveryQueries(tmp_path)
    detail = queries.change("r1", "plugins/panel.ts")
    assert "-panel A" in detail["diff"] and "+panel B" in detail["diff"]
    observation = queries.inspect("r1")
    (tmp_path / "plugins/panel.ts").write_text("manual B\n")
    failure = queries.undo("r1", observation["transactionId"], ["plugins/panel.ts"])
    assert failure == {"status": "conflict", "error": "CREATOR_UNDO_CONFLICT"}


def test_replaced_record_invalidates_old_observation(tmp_path):
    _record(tmp_path, "r1", [("src/plugins/panel.ts", "panel A\n", "panel B\n")])
    queries = CreatorRecoveryQueries(tmp_path)
    old = queries.inspect("r1")
    _record(tmp_path, "r1", [("src/plugins/panel.ts", "panel A\n", "panel C\n")])
    assert queries.undo("r1", old["transactionId"], ["src/plugins/panel.ts"]) == {
        "status": "conflict", "error": "CREATOR_TRANSACTION_CHANGED",
    }
    assert (tmp_path / "src/plugins/panel.ts").read_text() == "panel C\n"


def test_two_equal_length_changes_to_same_file_have_distinct_details(tmp_path):
    path = "src/plugins/panel.ts"
    _record(tmp_path, "r1", [(path, "state A\n", "state B\n")])
    _record(tmp_path, "r2", [(path, "state B\n", "state C\n")])
    queries = CreatorRecoveryQueries(tmp_path)
    first = queries.change("r1", path)
    second = queries.change("r2", path)
    assert "-state A" in first["diff"] and "+state B" in first["diff"]
    assert "-state B" in second["diff"] and "+state C" in second["diff"]
    assert first["transactionId"] != second["transactionId"]


def test_partial_feature_scope_never_expands_to_whole_run(tmp_path):
    _record(tmp_path, "r1", [
        ("src/plugins/panel.ts", "panel before", "panel after"),
        ("src/agent-ui/i18n/welcome.ts", "hello before", "hello after"),
    ])
    queries = CreatorRecoveryQueries(tmp_path)
    observed = queries.inspect("r1")
    result = queries.undo("r1", observed["transactionId"], ["src/plugins/panel.ts"])
    assert result["status"] == "scope_mismatch"
    assert (tmp_path / "src/plugins/panel.ts").read_text() == "panel after"
    assert (tmp_path / "src/agent-ui/i18n/welcome.ts").read_text() == "hello after"


def test_undo_is_recorded_as_current_run_mutation(tmp_path):
    path = "src/plugins/panel.ts"
    _record(tmp_path, "old-run", [(path, "before\n", "after\n")])
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("recovery-run")
    queries = CreatorRecoveryQueries(tmp_path, activity=activity)
    observed = queries.inspect("old-run")
    result = queries.undo("old-run", observed["transactionId"], [path])
    assert result["status"] == "undone"
    assert activity.revision == 1
    repeated = queries.undo("old-run", observed["transactionId"], [path])
    assert repeated == {"status": "already_undone", "error": "CREATOR_ALREADY_UNDONE"}
    assert activity.revision == 1
    receipt = activity.finish()
    assert [entry["path"] for entry in receipt["files"]] == [path]
    assert receipt["transaction"]["runId"] == "recovery-run"


def test_read_only_toolset_has_no_undo(tmp_path):
    names = {item.name for item in create_recovery_query_tools(CreatorRecoveryQueries(tmp_path))}
    assert "inspect_creator_transaction" in names
    assert "undo_creator_run" not in names
    assert json.loads(create_recovery_query_tools(CreatorRecoveryQueries(tmp_path))[0].invoke({}))["status"] == "evidence_missing"


def test_recovery_is_offered_after_policy_and_fast_paths(tmp_path):
    (tmp_path / ".agent-ui").mkdir()
    (tmp_path / ".agent-ui/project.json").write_text(json.dumps({"mode": "assistant", "sourceRoot": "src"}))
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.development())
    observations = DomainObservationContext()
    observations.observe_composition_snapshot(
        hash="a" * 64, revision=0,
        coverage=("composition.model", "composition.layout", "composition.slots",
                  "composition.instances", "capability.inventory",
                  "capability.composition-summary", "creator.actions"),
    )
    composition = CompositionGroundingConvergenceMiddleware(observations, backend)
    handoff = CreatorAuthoringHandoff(
        targetId="plugin:panel", kind="plugin_source", name="Panel", description="Panel",
        ownerRoot="src/plugins/panel", definitionPath="src/plugins/panel/index.ts",
        pluginId="panel",
    )
    source = SourceGroundingConvergenceMiddleware(backend, handoff, ToolProtocolMetrics())
    names = ("inspect_creator_transaction", "inspect_creator_transaction_change",
             "undo_creator_run", "mutate_app_ui_model", "read_file")
    request = ModelRequest(model=Mock(), messages=[],
                           tools=[SimpleNamespace(name=name) for name in names])
    write = DomainWriteToolPolicyMiddleware().wrap_model_call(request, lambda value: value)
    composition_result = composition._request(write)
    source_result = source._request(write)
    for result in (composition_result, source_result):
        offered = {item.name for item in result.tools}
        assert {"inspect_creator_transaction", "inspect_creator_transaction_change",
                "undo_creator_run"} <= offered
    read = DomainReadToolPolicyMiddleware().wrap_model_call(request, lambda value: value)
    assert "inspect_creator_transaction" in {item.name for item in read.tools}
    assert "undo_creator_run" not in {item.name for item in read.tools}
    tool_request = SimpleNamespace(tool_call={"name": "inspect_creator_transaction",
                                               "args": {"run_id": "r1"}, "id": "query"})
    composition.wrap_tool_call(tool_request, lambda _: ToolMessage(
        content="{}", tool_call_id="query", status="success"))
    source.wrap_tool_call(tool_request, lambda _: ToolMessage(
        content="{}", tool_call_id="query", status="success"))
    assert observations.composition_grounding_status(current_revision=0) == "unobserved"
    assert source.metrics.sourceFastPathExited is True


def test_missing_verification_cannot_finish_changed_run_as_success():
    receipt = {"files": [{"path": "src/agent-ui/app-ui/app-ui.json"}],
               "verification": {"status": "not-run"}}
    assert _completion_from_verification("success", receipt) == "blocked"
    receipt["verification"]["status"] = "changed-unverified"
    assert _completion_from_verification("success", receipt) == "committed_unverified"
    assert _completion_from_verification("blocked", receipt) == "blocked"
