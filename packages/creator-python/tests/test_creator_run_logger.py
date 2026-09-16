import json

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.observability import CreatorRunLogger


def test_lightweight_run_log_records_mutation_transaction_undo_and_metrics(tmp_path):
    logger = CreatorRunLogger(tmp_path)
    logger.begin(
        run_id="run-1", thread_id="thread-1", agent_mode="domain-write"
    )
    activity = CreatorActivityRecorder(tmp_path, logger=logger)
    activity.begin("run-1")
    target = tmp_path / "plugins" / "foo.ts"
    target.parent.mkdir()
    target.write_text("new", encoding="utf-8")
    activity.capture_before_content("plugins/foo.ts", "old")
    activity.touch("plugins/foo.ts")
    activity.finish()
    activity.transactions.undo("run-1")
    logger.finish(
        "success",
        metrics={"modelCalls": 2, "toolCalls": 1},
        change_layer_metrics={
            "taskChangeLayer": "plugin_behavior",
            "crossLayerTransitionCount": 0,
        },
        composition_fast_path_metrics={
            "attempted": True,
            "eligible": True,
        },
    )

    entries = [
        json.loads(line)
        for line in logger.path.read_text(encoding="utf-8").splitlines()
    ]
    assert [entry["type"] for entry in entries] == [
        "run_started",
        "file_mutation",
        "transaction_persisted",
        "undo",
        "run_finished",
    ]
    assert entries[-1]["data"]["modelToolMetrics"] == {
        "modelCalls": 2,
        "toolCalls": 1,
    }
    assert entries[-1]["data"]["changeLayer"] == {
        "taskChangeLayer": "plugin_behavior",
        "crossLayerTransitionCount": 0,
    }
    assert entries[-1]["data"]["compositionFastPath"] == {
        "attempted": True,
        "eligible": True,
    }
    assert entries[0]["data"] == {
        "runtime": "python",
        "agentMode": "domain-write",
    }
    assert entries[-1]["data"]["runtime"] == "python"
    assert entries[-1]["data"]["agentMode"] == "domain-write"


def test_run_logger_finishes_once_with_failure_snapshot(tmp_path):
    logger = CreatorRunLogger(tmp_path)
    logger.begin(run_id="failed-run", agent_mode="domain-write")
    logger.finish(
        "error",
        metrics={"modelCalls": 24, "toolCalls": 6},
        mutation_metrics={
            "mutationRequests": 6,
            "mutationOperations": 6,
            "mutationErrorCategories": {"workspace_integrity": 1},
            "semanticReplans": 0,
        },
        change_layer_metrics={
            "executedChangeLayer": "composition",
            "scopeResources": ["app-ui-model"],
        },
        project_control_metrics={"requests": 3},
        error=RuntimeError("agent stopped"),
    )
    logger.finish("success", metrics={"modelCalls": 999})

    entries = [
        json.loads(line)
        for line in logger.path.read_text(encoding="utf-8").splitlines()
    ]
    finished = [entry for entry in entries if entry["type"] == "run_finished"]
    assert len(finished) == 1
    data = finished[0]["data"]
    assert data["status"] == "error"
    assert data["modelToolMetrics"]["modelCalls"] == 24
    assert data["mutationMetrics"]["mutationRequests"] == 6
    assert data["changeLayerMetrics"]["scopeResources"] == ["app-ui-model"]
    assert data["projectControlMetrics"]["requests"] == 3
