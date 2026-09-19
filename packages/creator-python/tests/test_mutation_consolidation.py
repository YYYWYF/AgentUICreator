"""Scripted real-graph contracts, not evidence of live-model latency or compliance."""

from __future__ import annotations

import asyncio
import copy
import json

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, ToolMessage

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.app_ui_model.mutation_tool import create_app_ui_model_mutation_tool
from agent_ui_creator.app_ui_model.mutation_service import semantic_operation_summary
from agent_ui_creator.config import CreatorServerSettings
from agent_ui_creator.domain_agent import create_domain_write_creator_agent
from agent_ui_creator.domain_agent.prompt import DOMAIN_WRITE_AGENT_PROMPT
from agent_ui_creator.model_settings import CreatorModelSettings
from agent_ui_creator.observability import CreatorRunLogger
from agent_ui_creator.server import create_app

from test_domain_tool_batch_policy import BatchClient, BatchScriptModel, batch
from test_domain_write_grounding import APP_UI_MODEL_PATH, call, layout_slot


INSTANCE_ID = "session-manager-main"
FINAL_PLUGIN = {
    "id": INSTANCE_ID,
    "pluginId": "session-manager",
    "enabled": True,
}
ADD = [{
    "type": "insert_plugin",
    "plugin": FINAL_PLUGIN,
    "target": {"type": "layout_slot", "slotNodeId": "sidebar-right"},
}]
RESTORE = [{"type": "set_plugin_enabled", "instanceId": INSTANCE_ID, "enabled": True}]
MOVE = [{
    "type": "move_plugin",
    "instanceId": INSTANCE_ID,
    "target": {"type": "layout_slot", "slotNodeId": "sidebar-right"},
}]


def set_plugins(client, plugins_by_slot):
    model = client.model()
    for slot_node_id in ("sidebar-left", "sidebar-right"):
        layout_slot(model, slot_node_id)["plugins"] = copy.deepcopy(
            plugins_by_slot.get(slot_node_id, [])
        )
    (client.root / APP_UI_MODEL_PATH).write_text(json.dumps(model) + "\n", encoding="utf-8")


def mutate(operations, call_id="mutation"):
    return call("mutate_app_ui_model", {"operations": copy.deepcopy(operations)}, call_id)


def read_batch():
    # Both registration and exact model state are needed; ids come from the request.
    return batch(call("list_ui_plugins", {}, "plugins"), call("inspect_app_ui_model", {}, "model"))


def entries(logger):
    return [json.loads(line) for line in logger.path.read_text(encoding="utf-8").splitlines()]


def scripted_agent(client, responses, *, before_response=None):
    logger = CreatorRunLogger(client.root)
    logger.begin(run_id="consolidation", agent_mode="domain-write")
    activity = CreatorActivityRecorder(client.root, logger=logger)
    activity.begin("consolidation")
    model = BatchScriptModel(responses=responses, before_response=before_response)
    agent = create_domain_write_creator_agent(
        model=model, workspace=client.root, project_control=client, activity=activity
    )
    return agent, model, logger


def run(agent, prompt="恢复 session-manager 到 sidebar.right。"):
    return asyncio.run(asyncio.wait_for(agent.run(prompt), timeout=10))


def test_tool_and_prompt_preserve_final_state_transaction_contract(tmp_path):
    agent, _, _ = scripted_agent(BatchClient(tmp_path), [AIMessage(content="done")])
    tool = create_app_ui_model_mutation_tool(agent.mutation_service, agent.observations)
    description = " ".join(tool.description.split())
    for rule in (
        "atomic transaction", "one resolved user intent", "complete desired state",
        "Do not call this tool once per semantic operation",
        "insert_plugin includes its final enabled state",
        "move_plugin", "replace_plugin", "changed=false",
        "APP_UI_MODEL_HASH_CONFLICT", "APP_UI_MODEL_OBSERVATION_REQUIRED",
        "insert_plugin_default",
        "static composition commit only for low-level operations",
    ):
        assert rule in description
    schema = tool.args_schema["properties"]["operations"]
    assert "current resolved user intent" in schema["description"]
    assert "one complete transaction" in schema["description"]
    prompt = " ".join(DOMAIN_WRITE_AGENT_PROMPT.split())
    for rule in (
        "Desired state first, operations second",
        "user request -> current state -> desired state -> semantic delta -> operations",
        "semantic `insert_plugin_default`",
        "load `/skills/app-ui-model/SKILL.md` for low-level Composition operations",
        "smallest determinable atomic mutation",
        "Do not add a planning call, probe with partial writes",
        "stale refreshes do not consume the one allowed semantic replan",
        "changed=false",
        "workspace_integrity",
        "Automatically repair only introduced or in_scope defects",
    ):
        assert rule in prompt


@pytest.mark.parametrize("initial,operations,prompt", [
    ({}, ADD, "恢复 session-manager 到 sidebar.right。"),
    ({"sidebar-right": [{**FINAL_PLUGIN, "enabled": False}]}, RESTORE,
     "恢复已有 session-manager 到 sidebar.right。"),
    ({"sidebar-left": [FINAL_PLUGIN]}, MOVE,
     "移动 session-manager 到 sidebar.right。"),
], ids=["insert-final-state", "enable-existing", "dedicated-move"])
def test_final_state_uses_one_transaction_then_final(tmp_path, initial, operations, prompt):
    client = BatchClient(tmp_path, barrier_size=2)
    set_plugins(client, initial)
    agent, model, logger = scripted_agent(client, [
        read_batch(), mutate(operations), AIMessage(content="已完成静态组合修改。"),
    ])
    result = run(agent, prompt)
    metrics = result.app_ui_model_mutations
    assert metrics.requests == len(client.mutations) == 1
    assert metrics.operations == len(operations)
    assert metrics.operationsPerMutation == [len(operations)]
    assert result.metrics.modelCalls == len(model.seen_messages) == 3
    assert result.metrics.toolCalls == 3
    assert [item.name for item in result.activities][2:] == ["mutate_app_ui_model"]
    assert client.mutations[0]["operations"] == operations
    assert layout_slot(client.model(), "sidebar-right")["plugins"][0] == FINAL_PLUGIN
    assert agent.observations.snapshot()["appUIModel"]["source"] == "mutation_result"
    log = next(entry["data"] for entry in entries(logger) if entry["type"] == "app_ui_model_mutation")
    assert log == {
        "requestIndex": 1,
        "operationCount": len(operations),
        "operationTypes": [op["type"] for op in operations],
        "operationSummary": semantic_operation_summary(operations),
        "result": {"ok": True, "changed": True},
        "changedPaths": [APP_UI_MODEL_PATH],
    }


def test_changed_false_uses_authoritative_result_and_finishes_without_retry(tmp_path):
    client = BatchClient(tmp_path, barrier_size=2)
    set_plugins(client, {"sidebar-right": [FINAL_PLUGIN]})
    before_hash = client.hash()

    def check_result(index, messages):
        if index == 2:
            message = next(item for item in messages if isinstance(item, ToolMessage) and item.tool_call_id == "mutation")
            payload = json.loads(message.content)
            assert payload["ok"] is True
            assert payload["result"]["changed"] is False
            assert payload["result"]["appUIModel"]["afterHash"] == before_hash

    agent, model, logger = scripted_agent(client, [
        read_batch(), mutate(RESTORE), AIMessage(content="目标状态已满足。"),
    ], before_response=check_result)
    result = run(agent)
    assert result.app_ui_model_mutations.requests == len(client.mutations) == 1
    assert result.app_ui_model_mutations.successfulRequests == 1
    assert result.metrics.modelCalls == len(model.seen_messages) == 3
    assert agent.activity.revision == 0  # Request count must not derive from revision.
    assert agent.activity.finish()["files"] == []
    log = next(entry["data"] for entry in entries(logger) if entry["type"] == "app_ui_model_mutation")
    assert log["result"] == {"ok": True, "changed": False}
    assert log["changedPaths"] == []


def test_hash_conflict_counts_both_requests_but_only_one_success(tmp_path):
    client = BatchClient(tmp_path, conflict_once=True)
    set_plugins(client, {})

    def change_before_refresh(index, messages):
        if index == 2:
            path = tmp_path / APP_UI_MODEL_PATH
            path.write_text(path.read_text(encoding="utf-8") + "\n", encoding="utf-8")

    agent, _, logger = scripted_agent(client, [
        call("inspect_app_ui_model", {}, "initial"), mutate(ADD, "conflict"),
        call("inspect_app_ui_model", {}, "refresh"), mutate(ADD, "retry"),
        AIMessage(content="已刷新并提交。"),
    ], before_response=change_before_refresh)
    result = run(agent)
    metrics = result.app_ui_model_mutations
    assert metrics.requests == 2
    assert metrics.operationsPerMutation == [1, 1]
    assert metrics.hashConflicts == metrics.successfulRequests == 1
    assert metrics.summary()["multiSuccessfulMutationRun"] is False
    assert client.mutations[0]["appUIModelHash"] != client.mutations[1]["appUIModelHash"]
    logs = [entry["data"] for entry in entries(logger) if entry["type"] == "app_ui_model_mutation"]
    assert [log["requestIndex"] for log in logs] == [1, 2]
    assert logs[0]["result"]["ok"] is False
    assert logs[0]["errorCode"] == "APP_UI_MODEL_HASH_CONFLICT"
    assert logs[1]["result"]["ok"] is True


@pytest.mark.parametrize("multiple", [False, True], ids=["three-operations", "two-successes-no-cap"])
def test_endpoint_logs_mutation_summary_without_blocking_success(tmp_path, monkeypatch, multiple):
    client = BatchClient(tmp_path, barrier_size=2)
    set_plugins(client, {})
    if multiple:
        # Deliberately exercise multiple successes: diagnostics must never reject them.
        responses = [read_batch(), mutate(ADD, "first"), mutate([
            {
                **MOVE[0],
                "target": {"type": "layout_slot", "slotNodeId": "sidebar-left"},
            }
        ], "second"), AIMessage(content="完成。")]
        expected_counts = [1, 1]
    else:
        operations = [
            {
                "type": "insert_plugin",
                "plugin": {**FINAL_PLUGIN, "id": f"sessions-{index}"},
                "target": {"type": "layout_slot", "slotNodeId": "sidebar-right"},
            }
            for index in range(3)
        ]
        responses = [read_batch(), mutate(operations), AIMessage(content="完成。")]
        expected_counts = [3]
    model = BatchScriptModel(responses=responses)
    monkeypatch.setenv("CREATOR_PYTHON_AGENT_MODE", "domain-write")
    monkeypatch.setattr(
        "agent_ui_creator.server.CreatorModelSettings.from_environment",
        classmethod(lambda cls, **kwargs: CreatorModelSettings(
            model_name="scripted-consolidation", base_url="http://unused.invalid/v1", api_key="unused-test-key"
        )),
    )
    monkeypatch.setattr("agent_ui_creator.model_factory.create_creator_chat_model", lambda *args, **kwargs: model)
    monkeypatch.setattr("agent_ui_creator.domain_agent.agent.ProjectControlClient", lambda **kwargs: client)
    settings = CreatorServerSettings(project_root=tmp_path, skills_root=tmp_path, auth_token="x" * 32)
    with TestClient(create_app(settings), headers={"Authorization": f"Bearer {settings.auth_token}"}) as http:
        response = http.post("/creator", json={
            "threadId": "consolidation", "runId": "consolidation",
            "messages": [{"role": "user", "content": "恢复 session-manager 到 sidebar.right。"}],
        })
    events = [json.loads(line.removeprefix("data:")) for line in response.text.splitlines() if line.startswith("data:")]
    assert events[-1]["type"] == "RUN_FINISHED"
    assert not any(event["type"] == "RUN_ERROR" for event in events)
    result = events[-1]["result"]
    expected = {
        "mutationRequests": len(expected_counts),
        "mutationOperations": sum(expected_counts),
        "operationsPerMutation": expected_counts,
        "multiSuccessfulMutationRun": multiple,
        "mutationErrorCategories": {},
        "semanticReplans": 0,
        "semanticReplanLimitReached": False,
    }
    assert {key: result[key] for key in expected} == expected
    assert result["appUIModelMutations"]["requests"] == len(expected_counts)
    assert result["appUIModelMutations"]["operations"] == sum(expected_counts)
    assert result["toolProtocol"]["modelCalls"] == len(responses)
    path = tmp_path / result["receipt"]["diagnosticLog"]["path"]
    logs = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
    summary = next(entry["data"] for entry in logs if entry["type"] == "run_finished")
    assert summary["outcome"] == "success"
    assert {key: summary[key] for key in expected} == expected
    mutations = [entry["data"] for entry in logs if entry["type"] == "app_ui_model_mutation"]
    assert [entry["operationCount"] for entry in mutations] == expected_counts
    assert [entry["requestIndex"] for entry in mutations] == list(range(1, len(expected_counts) + 1))
    assert all("operations" not in entry for entry in mutations)
    if not multiple:
        assert mutations[0]["operationTypes"] == ["insert_plugin"] * 3
        # Three instance operations change only one model file.
        assert result["receipt"]["verification"]["projectRevision"] == 1
