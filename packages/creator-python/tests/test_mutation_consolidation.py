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
from agent_ui_creator.config import CreatorServerSettings
from agent_ui_creator.domain_agent import create_domain_write_creator_agent
from agent_ui_creator.domain_agent.prompt import DOMAIN_WRITE_AGENT_PROMPT
from agent_ui_creator.model_settings import CreatorModelSettings
from agent_ui_creator.observability import CreatorRunLogger
from agent_ui_creator.server import create_app

from test_domain_tool_batch_policy import BatchClient, BatchScriptModel, batch
from test_domain_write_grounding import APP_UI_MODEL_PATH, call


INSTANCE_ID = "session-manager-main"
FINAL_INSTANCE = {
    "id": INSTANCE_ID,
    "pluginId": "session-manager",
    "enabled": True,
    "mount": {"slotId": "sidebar.right"},
    "props": {"title": "Sessions"},
}
ADD = [{"type": "add_instance", "instance": FINAL_INSTANCE}]
RESTORE = [
    {"type": "set_instance_enabled", "instanceId": INSTANCE_ID, "enabled": True},
    {"type": "mount_instance", "instanceId": INSTANCE_ID, "slotId": "sidebar.right"},
]
MOVE = [{"type": "move_instance", "instanceId": INSTANCE_ID, "slotId": "sidebar.right"}]


def set_instances(client, instances):
    model = client.model()
    model["pluginInstances"] = copy.deepcopy(instances)
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
        "add_instance can include final enabled, mount, and props",
        "move_instance", "replace_instance", "changed=false",
        "APP_UI_MODEL_HASH_CONFLICT", "APP_UI_MODEL_OBSERVATION_REQUIRED",
        "static composition commit only",
    ):
        assert rule in description
    schema = tool.args_schema["properties"]["operations"]
    assert "current resolved user intent" in schema["description"]
    assert "one complete transaction" in schema["description"]
    prompt = " ".join(DOMAIN_WRITE_AGENT_PROMPT.split())
    for rule in (
        "Before the first mutate_app_ui_model call",
        "complete desired composition state", "smallest semantic representation",
        "add_instance.instance already supports final enabled, mount, and props",
        "replace_instance with final enabled, props, and mount in replacement",
        "partial successful mutation", "BAD:", "GOOD, new:", "GOOD, existing:",
        "provide the final response", "changed=false", "previously unpredictable",
        "not subject to a one-mutation hard limit",
    ):
        assert rule in prompt


@pytest.mark.parametrize("initial,operations,prompt", [
    ({}, ADD, "恢复 session-manager 到 sidebar.right。"),
    ({INSTANCE_ID: {**FINAL_INSTANCE, "enabled": False, "mount": None}}, RESTORE,
     "恢复已有 session-manager 到 sidebar.right。"),
    ({INSTANCE_ID: {**FINAL_INSTANCE, "mount": {"slotId": "sidebar.left"}}}, MOVE,
     "移动 session-manager 到 sidebar.right。"),
], ids=["add-final-state", "enable-and-mount", "dedicated-move"])
def test_final_state_uses_one_transaction_then_final(tmp_path, initial, operations, prompt):
    client = BatchClient(tmp_path, barrier_size=2)
    set_instances(client, initial)
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
    assert client.model()["pluginInstances"][INSTANCE_ID] == FINAL_INSTANCE
    assert agent.observations.snapshot()["appUIModel"]["source"] == "mutation_result"
    log = next(entry["data"] for entry in entries(logger) if entry["type"] == "app_ui_model_mutation")
    assert log == {
        "requestIndex": 1,
        "operationCount": len(operations),
        "operationTypes": [op["type"] for op in operations],
        "result": {"ok": True, "changed": True},
        "changedPaths": [APP_UI_MODEL_PATH],
    }


def test_changed_false_uses_authoritative_result_and_finishes_without_retry(tmp_path):
    client = BatchClient(tmp_path, barrier_size=2)
    set_instances(client, {INSTANCE_ID: FINAL_INSTANCE})
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
    set_instances(client, {})

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
    set_instances(client, {})
    if multiple:
        # Deliberately exercise multiple successes: diagnostics must never reject them.
        responses = [read_batch(), mutate(ADD, "first"), mutate([
            {**MOVE[0], "slotId": "sidebar.left"}
        ], "second"), AIMessage(content="完成。")]
        expected_counts = [1, 1]
    else:
        operations = [
            {"type": "add_instance", "instance": {**FINAL_INSTANCE, "id": f"sessions-{index}"}}
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
        assert mutations[0]["operationTypes"] == ["add_instance"] * 3
        # Three instance operations change only one model file.
        assert result["receipt"]["verification"]["projectRevision"] == 1
