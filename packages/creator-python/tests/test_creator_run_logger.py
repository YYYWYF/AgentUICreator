import json

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.observability import CreatorRunLogger


def test_lightweight_run_log_records_mutation_transaction_undo_and_metrics(tmp_path):
    logger = CreatorRunLogger(tmp_path)
    logger.begin(run_id="run-1", thread_id="thread-1")
    activity = CreatorActivityRecorder(tmp_path, logger=logger)
    activity.begin("run-1")
    target = tmp_path / "plugins" / "foo.ts"
    target.parent.mkdir()
    target.write_text("new", encoding="utf-8")
    activity.capture_before_content("plugins/foo.ts", "old")
    activity.touch("plugins/foo.ts")
    activity.finish()
    activity.transactions.undo("run-1")
    logger.finish("success", metrics={"modelCalls": 2, "toolCalls": 1})

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
