from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.observability import CreatorRunLogger
from agent_ui_creator.server import _failed_run_outcome
from langchain_core.messages import ToolMessage


def test_stop_reports_recorded_changes_and_excludes_cancellation_from_tool_failures(tmp_path):
    logger = CreatorRunLogger(tmp_path)
    logger.begin(run_id="stop")
    activity = CreatorActivityRecorder(tmp_path, logger=logger)
    activity.begin("stop")
    logger.record_tool_observation(model_call_sequence=1,tool_name="read_file",phase="before_first_mutation",
                                   arguments={},result=ToolMessage(content="Error: File '/bad' not found",status="error",tool_call_id="read"))
    outcome = _failed_run_outcome(activity,logger,stopped=True)["creatorRunOutcome"]
    assert outcome["changeStatus"] == "none"
    assert outcome["toolErrorCount"] == 1
    assert outcome["lastToolName"] == "read_file"
    assert "/bad" in outcome["toolErrors"][0]["reason"]
