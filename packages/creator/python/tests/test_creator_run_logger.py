import json

from langchain_core.messages import ToolMessage

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
        operator_metrics={"requests": 3},
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
    assert data["operatorMetrics"]["requests"] == 3


def test_run_logger_records_bounded_tool_trajectory(tmp_path):
    logger = CreatorRunLogger(tmp_path)
    logger.begin(run_id="trajectory-run", thread_id="trajectory-thread")
    logger.record_tool_observation(
        model_call_sequence=2,
        tool_name="inspect_ui_project",
        phase="before_first_mutation",
        arguments={
            "view": "composition",
            "prompt": "do not persist this content",
            "token": "secret-value",
        },
        result={"ok": True, "result": {"fullSnapshot": "omitted"}},
    )
    logger.record_tool_observation(
        model_call_sequence=3,
        tool_name="mutate_app_ui_model",
        phase="after_first_mutation",
        arguments={
            "operations": [
                {
                    "type": "insert_plugin",
                    "plugin": {
                        "id": "sample-main",
                        "pluginId": "sample",
                        "enabled": True,
                    },
                    "target": {"type": "application"},
                }
            ]
        },
        result={"ok": False, "error": {"code": "APP_UI_MODEL_HASH_CONFLICT"}},
    )

    entries = [
        json.loads(line)
        for line in logger.path.read_text(encoding="utf-8").splitlines()
    ]
    observations = [
        entry for entry in entries if entry["type"] == "creator_tool_observation"
    ]
    assert {key: observations[0]["data"][key] for key in (
        "modelCallSequence", "toolName", "phase", "arguments", "result",
    )} == {
        "modelCallSequence": 2,
        "toolName": "inspect_ui_project",
        "phase": "before_first_mutation",
        "arguments": {"view": "composition"},
        "result": {
            "status": "success",
            "code": None,
            "factKinds": [
                "composition.snapshot",
                "capability.summary",
                "service.readiness",
                "creator.authoring-targets",
            ],
        },
    }
    assert observations[1]["data"]["arguments"] == {
        "operationCount": 1,
        "operationTypes": ["insert_plugin"],
    }
    assert observations[1]["data"]["result"] == {
        "status": "rejected",
        "code": "APP_UI_MODEL_HASH_CONFLICT",
        "factKinds": ["composition.commit"],
    }


def test_native_edit_error_records_bounded_reason_without_edit_arguments(tmp_path):
    logger = CreatorRunLogger(tmp_path)
    logger.begin(run_id="native-edit-error")
    logger.record_tool_observation(
        model_call_sequence=2,
        tool_name="edit_file",
        tool_call_id="edit-1",
        phase="before_first_mutation",
        arguments={
            "file_path": "/plugins/example/index.tsx",
            "old_string": "secret oldText",
            "new_string": "secret newText",
        },
        result=ToolMessage(
            content="Error: String not found in file: 'secret oldText'",
            tool_call_id="edit-1", status="error",
        ),
    )
    observation = json.loads(logger.path.read_text(encoding="utf-8").splitlines()[-1])["data"]
    assert observation["toolCallId"] == "edit-1"
    assert observation["structuredErrorReason"] == "Error: String not found in file"
    assert observation["arguments"] == {"file_path": "/plugins/example/index.tsx"}
    assert "secret" not in json.dumps(observation)


def test_tool_navigation_parameters_are_bounded_and_content_free():
    from agent_ui_creator.observability.run_logger import _sanitized_tool_arguments, _paging_metadata
    cursor = 'a' * 64 + ':' + 'b' * 32 + ':20000'
    assert _sanitized_tool_arguments('inspect_ui_project', {'view': 'composition', 'cursor': cursor}) == {
        'view': 'composition', 'hasCursor': True, 'cursorValid': True, 'snapshotHash': 'a' * 64, 'offset': 20000}
    assert _sanitized_tool_arguments('inspect_ui_project', {'cursor': 'private-invalid-cursor'}) == {'hasCursor': True, 'cursorValid': False}
    search = _sanitized_tool_arguments('grep', {'path': '/中文', 'pattern': 'Bearer very-secret-value', 'replacement': 'never logged'})
    assert 'very-secret-value' not in str(search)
    assert search['path'] == '/中文' and 'replacement' not in search
    assert len(_sanitized_tool_arguments('grep', {'pattern': 'x' * 500})['pattern']) == 300
    assert _sanitized_tool_arguments('read_file', {'file_path': '/a', 'offset': 20, 'limit': 10}) == {'file_path': '/a', 'offset': 20, 'limit': 10}
    assert _sanitized_tool_arguments('mutate_app_ui_model', {'operations': [{'type': 'set_plugin_enabled', 'instanceId': 'reasoning-main', 'enabled': False, 'config': 'secret'}]})['operationTargets'] == [{'type': 'set_plugin_enabled', 'instanceId': 'reasoning-main', 'enabled': False}]
    assert _paging_metadata({'result': {'pageText': 'private page', 'pageOffset': 0, 'totalChars': 50000, 'pageComplete': False, 'snapshotHash': 'a' * 64, 'nextCursor': cursor}}) == {
        'paging': {'pageOffset': 0, 'totalChars': 50000, 'pageComplete': False, 'snapshotHash': 'a' * 64, 'nextOffset': 20000}}


def test_directed_queries_log_json_encoded_arrays_without_expression_content():
    from agent_ui_creator.observability.run_logger import _sanitized_tool_arguments
    value = _sanitized_tool_arguments("inspect_ui_plugin", {"pluginId": "tool-timeline", "sharedSymbols": '["projectToolTimeline.$return.calls.$element", "AgentUILocaleMessages.toolTimeline", "../secret", "A()"]'})
    assert value == {"pluginId": "tool-timeline", "sharedSymbols": ["projectToolTimeline.$return.calls.$element", "AgentUILocaleMessages.toolTimeline"]}


def test_shared_contract_delivery_is_read_from_the_actual_tool_message():
    from agent_ui_creator.observability.run_logger import _shared_contract_metadata
    response=ToolMessage(content=json.dumps({"ok":True,"result":{"sharedTypes":{
        "status":"available","module":"public-module","queryResolution":{"resolved":1},
        "symbols":[{"name":"Dialog","status":"available","presentationContract":{"presentation":"raw"}}]}}}),tool_call_id="query")
    result=_shared_contract_metadata(response)
    assert result["sharedContract"]["module"] == "public-module"
    assert result["sharedContractSymbols"] == [{"name":"Dialog","status":"available","hasPresentationContract":True}]
    assert _shared_contract_metadata(ToolMessage(content='{"ok":true,"result":{}}',tool_call_id="empty")) == {}
