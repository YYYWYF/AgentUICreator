"""Scripted real-graph regressions; these do not establish live-model latency.

The barrier runs inside real ProjectControl tools dispatched by DeepAgent. No
test-side tool executor can make a serial ToolNode pass the concurrency test.
"""

from __future__ import annotations

import asyncio
import copy
import json
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from langchain.agents.middleware import ModelRequest, ModelResponse
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from agent_ui_creator.config import CreatorServerSettings
from agent_ui_creator.domain_agent import create_domain_write_creator_agent
from agent_ui_creator.domain_agent.prompt import DOMAIN_WRITE_AGENT_PROMPT
from agent_ui_creator.domain_agent.tool_batch_policy import (
    BATCH_POLICY_REPAIR_PROMPT,
    DomainToolBatchPolicyMiddleware,
    is_valid_domain_tool_batch,
)
from agent_ui_creator.domain_agent.tool_policy import (
    ALLOWED_DOMAIN_WRITE_TOOLS,
    READ_ONLY_TOOL_NAMES,
    SIDE_EFFECT_TOOL_NAMES,
)
from agent_ui_creator.files import read_creator_file_state
from agent_ui_creator.model_protocol.errors import ModelToolProtocolError
from agent_ui_creator.model_protocol.trace import ToolProtocolMetrics
from agent_ui_creator.model_settings import CreatorModelSettings
from agent_ui_creator.project_control import ProjectControlError
from agent_ui_creator.server import create_app

from test_domain_write_grounding import (
    APP_UI_MODEL_PATH,
    REGISTRY_PATH,
    GroundingClient,
    GroundingScriptModel,
    call,
    project_files,
)


def batch(*calls):
    return AIMessage(content="", tool_calls=[item.tool_calls[0] for item in calls])


OPERATIONS = [
    {
        "type": "add_instance",
        "instance": {
            "id": "session-manager-restored",
            "pluginId": "session-manager",
            "enabled": False,
        },
    },
    {
        "type": "set_instance_enabled",
        "instanceId": "session-manager-restored",
        "enabled": True,
    },
    {
        "type": "mount_instance",
        "instanceId": "session-manager-restored",
        "slotId": "sidebar.right",
    },
]


def mutation(call_id="mutation-1"):
    return call("mutate_app_ui_model", {"operations": copy.deepcopy(OPERATIONS)}, call_id)


class BatchScriptModel(GroundingScriptModel):
    before_response: Callable | None = None

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        if self.before_response is not None:
            self.before_response(len(self.seen_messages), messages)
        return super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)


class BatchClient(GroundingClient):
    def __init__(self, root, *, barrier_size=0, conflict_once=False):
        super().__init__(root)
        self.barrier_size = barrier_size
        self.started = []
        self.release = asyncio.Event()
        self.conflict_once = conflict_once

    async def read_barrier(self, name):
        self.started.append(name)
        if self.barrier_size:
            if len(self.started) == self.barrier_size:
                self.release.set()
            # A serial ToolNode cannot start the remaining reads and times out.
            await asyncio.wait_for(self.release.wait(), timeout=3)

    async def inspect_ui_project(self):
        await self.read_barrier("inspect_ui_project")
        self.record("inspect_ui_project")
        return {"appUIModel": {"hash": self.hash(), "model": self.model()}}

    async def inspect_app_ui_model(self):
        await self.read_barrier("inspect_app_ui_model")
        self.record("inspect_app_ui_model")
        return {"hash": self.hash(), "model": self.model()}

    async def list_ui_plugins(self):
        await self.read_barrier("list_ui_plugins")
        return await super().list_ui_plugins()

    async def inspect_ui_plugin(self, plugin_id):
        await self.read_barrier("inspect_ui_plugin")
        self.record("inspect_ui_plugin", {"pluginId": plugin_id})
        return {"pluginId": plugin_id, "instances": list(self.model()["pluginInstances"].values())}

    async def inspect_ui_slots(self, *, root=None):
        await self.read_barrier("inspect_ui_slots")
        return await super().inspect_ui_slots(root=root)

    async def request_app_ui_model_mutation(self, input):
        self.mutations.append(copy.deepcopy(input))
        self.metrics.record("mutate_app_ui_model", 1, False)
        if self.conflict_once and len(self.mutations) == 1:
            raise ProjectControlError("APP_UI_MODEL_HASH_CONFLICT", "stale observation")
        assert input["appUIModelHash"] == self.hash()
        before_hash = self.hash()
        model = self.model()
        for operation in input["operations"]:
            kind = operation["type"]
            if kind == "add_instance":
                instance = copy.deepcopy(operation["instance"])
                model["pluginInstances"][instance["id"]] = instance
            elif kind == "set_instance_enabled":
                model["pluginInstances"][operation["instanceId"]]["enabled"] = operation["enabled"]
            elif kind == "mount_instance":
                model["pluginInstances"][operation["instanceId"]]["mount"] = {
                    "slotId": operation["slotId"]
                }
            else:
                raise AssertionError(f"Unexpected scripted operation: {kind}")
        (self.root / APP_UI_MODEL_PATH).write_text(json.dumps(model) + "\n", encoding="utf-8")
        return {
            "schemaVersion": 1,
            "transactionId": "batch-restore",
            "changed": True,
            "changedPaths": [APP_UI_MODEL_PATH],
            "appUIModel": {"beforeHash": before_hash, "afterHash": self.hash()},
            "snapshotToken": {
                "appUIModelHash": self.hash(),
                "registryHash": read_creator_file_state(self.root, REGISTRY_PATH).hash,
            },
        }


def make_agent(client, responses, *, before_response=None):
    model = BatchScriptModel(responses=responses, before_response=before_response)
    agent = create_domain_write_creator_agent(
        model=model, workspace=client.root, project_control=client
    )
    agent.activity.begin("round-trip-test")
    return agent, model


def run(agent):
    return asyncio.run(asyncio.wait_for(
        agent.run("恢复已有 session-manager 插件到 sidebar.right。"), timeout=10
    ))


def test_side_effect_classification_and_round_trip_prompt_contract():
    assert SIDE_EFFECT_TOOL_NAMES == {"edit_file", "mutate_app_ui_model"}
    assert READ_ONLY_TOOL_NAMES == set(ALLOWED_DOMAIN_WRITE_TOOLS) - SIDE_EFFECT_TOOL_NAMES
    prompt = " ".join(DOMAIN_WRITE_AGENT_PROMPT.split())
    for rule in (
        "Keep grounding demand-driven",
        "Round-trip reduction policy",
        "at most three independent read-only tool calls",
        "Do not batch speculative inspections",
        "arguments or necessity depend on an earlier result, wait for that result",
        "If list_ui_plugins is genuinely required to discover the target identifier, call it first",
        "Never guess a pluginId",
        "Never combine edit_file or mutate_app_ui_model with another tool call",
        "one atomic mutation containing all semantic operations",
        "updated authoritative observation",
        "Do not immediately re-inspect",
        "provide the final response",
        "another recoverable error",
        "APP_UI_MODEL_HASH_CONFLICT",
        "APP_UI_MODEL_OBSERVATION_REQUIRED",
    ):
        assert rule in prompt


@pytest.mark.parametrize("message", [
    AIMessage(content="done"),
    call("edit_file", {}, "write"),
    mutation(),
    batch(call("read_file", {"file_path": "/a"}, "a"), call("read_file", {"file_path": "/b"}, "b")),
])
def test_valid_single_action_or_distinct_reads(message):
    # Protocol schema validity is deliberately a separate responsibility.
    assert is_valid_domain_tool_batch(ModelResponse(result=[message]))


def test_policy_inspects_last_ai_message_and_canonical_arguments():
    duplicate = batch(
        call("grep", {"pattern": "x", "path": "/plugins"}, "a"),
        call("grep", {"path": "/plugins", "pattern": "x"}, "b"),
    )
    assert not is_valid_domain_tool_batch(ModelResponse(result=[AIMessage(content="old"), duplicate]))
    assert is_valid_domain_tool_batch(ModelResponse(result=[duplicate, AIMessage(content="done")]))


def test_deepagent_parallel_read_batch_preserves_guards_and_activity(tmp_path):
    client = BatchClient(tmp_path, barrier_size=3)
    names = ["inspect_ui_project", "inspect_app_ui_model", "list_ui_plugins"]
    agent, model = make_agent(client, [
        batch(*(call(name, {}, f"read-{index}") for index, name in enumerate(names))),
        AIMessage(content="Inspection complete."),
    ])
    result = run(agent)
    receipt = agent.activity.finish()

    assert sorted(client.started) == sorted(names)
    assert len(client.reads) == len(result.activities) == 3
    assert {item.callId: item.name for item in result.activities} == {
        f"read-{index}": name for index, name in enumerate(names)
    }
    assert all(json.loads(item.result)["ok"] for item in result.activities)
    assert result.metrics.modelCalls == len(model.seen_messages) == 2
    assert result.metrics.toolCalls == 3
    assert result.metrics.batchPolicyViolations == 0
    assert result.metrics.batchPolicyRepairAttempts == 0
    assert result.metrics.repeatedToolLoops == result.repeated_project_control_reads == 0
    assert result.domain_observations.updates == 3
    assert receipt["files"] == []
    assert agent.activity.revision == 0
    assert result.metrics.traces[0].toolCallCount == 3
    assert result.metrics.traces[0].toolCallNames == tuple(names)


INVALID_BATCHES = [
    batch(call("inspect_app_ui_model", {}, "bad-read"), mutation("bad-write")),
    batch(mutation("bad-write-1"), mutation("bad-write-2")),
    batch(
        call("edit_file", {"file_path": "/plugins/example.ts", "old_string": "a", "new_string": "b"}, "bad-edit"),
        mutation("bad-mutation"),
    ),
    batch(call("inspect_ui_project", {}, "duplicate-1"), call("inspect_ui_project", {}, "duplicate-2")),
    batch(*(call(name, {}, f"over-limit-{index}") for index, name in enumerate(
        ["inspect_ui_project", "inspect_app_ui_model", "list_ui_plugins", "inspect_ui_slots"]
    ))),
]


@pytest.mark.parametrize("invalid", INVALID_BATCHES, ids=["read-write", "two-writes", "edit-mutation", "duplicate", "four-reads"])
def test_real_middleware_stack_repairs_before_any_dispatch_and_counts_every_model_call(tmp_path, invalid):
    client = BatchClient(tmp_path)
    before = project_files(tmp_path)

    def assert_not_dispatched(index, messages):
        if index == 1:
            assert client.reads == client.mutations == []
            assert agent.runtime.activities == []
            assert agent.activity.revision == 0
            assert project_files(tmp_path) == before
            assert isinstance(messages[-1], HumanMessage)
            assert messages[-1].content == BATCH_POLICY_REPAIR_PROMPT
            assert not any(isinstance(item, AIMessage) and item.tool_calls for item in messages)

    agent, model = make_agent(client, [
        invalid,
        call("inspect_app_ui_model", {}, "safe-read"),
        mutation("safe-mutation"),
        AIMessage(content="Static composition committed."),
    ], before_response=assert_not_dispatched)
    result = run(agent)

    assert [item.callId for item in result.activities] == ["safe-read", "safe-mutation"]
    assert len(client.mutations) == 1
    assert agent.activity.revision == 1
    assert result.metrics.modelCalls == len(model.seen_messages) == 4
    assert len(result.metrics.traces) == 4
    assert [trace.sequence for trace in result.metrics.traces] == [1, 2, 3, 4]
    assert result.metrics.batchPolicyViolations == 1
    assert result.metrics.batchPolicyRepairAttempts == 1
    assert result.metrics.batchPolicyRepairSuccesses == 1
    assert result.metrics.invalidToolCalls == 0
    assert result.metrics.toolArgumentParseFailures == 0
    assert result.metrics.protocolRepairAttempts == 0
    assert agent.protocol.max_model_calls == 12


def test_second_invalid_batch_fails_without_dispatch_or_protocol_metric_pollution(tmp_path):
    client = BatchClient(tmp_path)
    invalid = INVALID_BATCHES[0]
    agent, model = make_agent(client, [invalid, invalid])
    with pytest.raises(ModelToolProtocolError, match="after one repair"):
        run(agent)
    assert client.reads == client.mutations == agent.runtime.activities == []
    assert agent.activity.revision == 0
    assert agent.protocol.metrics.modelCalls == len(model.seen_messages) == 2
    assert agent.protocol.metrics.batchPolicyViolations == 2
    assert agent.protocol.metrics.batchPolicyRepairAttempts == 1
    assert agent.protocol.metrics.batchPolicyRepairSuccesses == 0
    assert agent.protocol.metrics.protocolRepairAttempts == 0
    assert agent.protocol.metrics.invalidToolCalls == 0


def test_batch_policy_also_checks_a_protocol_repair_response(tmp_path):
    client = BatchClient(tmp_path)
    agent, model = make_agent(client, [
        AIMessage(content='inspect_app_ui_model({})'),
        INVALID_BATCHES[0],
        call("inspect_app_ui_model", {}, "safe-read"),
        AIMessage(content="Inspection complete."),
    ])
    result = run(agent)
    assert [item.callId for item in result.activities] == ["safe-read"]
    assert client.mutations == []
    assert result.metrics.modelCalls == len(model.seen_messages) == 4
    assert result.metrics.protocolRepairAttempts == 1
    assert result.metrics.protocolRepairSuccesses == 1
    assert result.metrics.batchPolicyViolations == 1
    assert result.metrics.batchPolicyRepairAttempts == 1
    assert result.metrics.batchPolicyRepairSuccesses == 1


@pytest.mark.parametrize("async_mode", [False, True])
def test_sync_and_async_policy_wrap_have_the_same_bounded_repair(async_mode):
    metrics = ToolProtocolMetrics()
    middleware = DomainToolBatchPolicyMiddleware(metrics=metrics)
    request = ModelRequest(model=object(), messages=[], tools=[])
    responses = iter([
        ModelResponse(result=[INVALID_BATCHES[0]]),
        ModelResponse(result=[call("inspect_app_ui_model", {}, "fixed")]),
    ])
    requests = []

    def handler(value):
        requests.append(value)
        return next(responses)

    async def async_handler(value):
        return handler(value)

    response = (
        asyncio.run(middleware.awrap_model_call(request, async_handler))
        if async_mode else middleware.wrap_model_call(request, handler)
    )
    assert response.result[-1].tool_calls[0]["id"] == "fixed"
    assert len(requests) == 2
    assert requests[-1].messages[-1].content == BATCH_POLICY_REPAIR_PROMPT
    assert metrics.batchPolicyRepairSuccesses == 1


def test_restore_round_trip_budget_one_atomic_mutation_without_confirmation_reads(tmp_path):
    client = BatchClient(tmp_path, barrier_size=2)
    agent, model = make_agent(client, [
        batch(
            call("inspect_ui_plugin", {"pluginId": "session-manager"}, "plugin"),
            call("inspect_ui_slots", {}, "slots"),
        ),
        mutation(),
        AIMessage(content="已恢复到右侧栏；未进行运行时验证。"),
    ])
    result = run(agent)
    receipt = agent.activity.finish()

    assert result.metrics.modelCalls == len(model.seen_messages) == 3
    assert result.metrics.modelCalls <= 4
    assert result.metrics.toolCalls == 3
    assert len(client.mutations) == result.app_ui_model_mutations.requests == 1
    assert client.mutations[0]["operations"] == OPERATIONS
    assert result.app_ui_model_mutations.operations == 3
    assert result.app_ui_model_mutations.resultMismatches == 0
    assert [trace.toolCallCount for trace in result.metrics.traces] == [2, 1, 0]
    assert [item.name for item in result.activities][2:] == ["mutate_app_ui_model"]
    assert {name for name, _ in client.reads} == {"inspect_ui_plugin", "inspect_ui_slots"}
    assert agent.observations.snapshot()["appUIModel"]["source"] == "mutation_result"
    assert agent.observations.snapshot()["appUIModel"]["hash"] == client.hash()
    mutation_result = next(
        item for item in model.seen_messages[-1]
        if isinstance(item, ToolMessage) and item.tool_call_id == "mutation-1"
    )
    assert json.loads(mutation_result.content)["ok"] is True
    assert client.model()["pluginInstances"]["session-manager-restored"]["mount"] == {"slotId": "sidebar.right"}
    assert receipt["files"][0]["path"] == APP_UI_MODEL_PATH
    assert receipt["transaction"]["undoable"] is True
    assert receipt["verification"]["status"] == "not-run"


def test_dependent_plugin_discovery_remains_sequential(tmp_path):
    client = BatchClient(tmp_path)

    def discovery_is_available(index, messages):
        if index == 1:
            assert client.reads == [("list_ui_plugins", {})]
            result = next(item for item in messages if isinstance(item, ToolMessage))
            assert json.loads(result.content)["result"]["pluginAssets"][0]["pluginId"] == "session-manager"

    agent, model = make_agent(client, [
        call("list_ui_plugins", {}, "discover"),
        call("inspect_ui_plugin", {"pluginId": "session-manager"}, "resolved"),
        AIMessage(content="Found the existing session plugin."),
    ], before_response=discovery_is_available)
    result = run(agent)
    assert [item.callId for item in result.activities] == ["discover", "resolved"]
    assert result.metrics.modelCalls == len(model.seen_messages) == 3
    assert result.metrics.batchPolicyViolations == 0
    assert client.mutations == []


def test_conflict_allows_fresh_inspection_and_second_mutation(tmp_path):
    client = BatchClient(tmp_path, conflict_once=True)

    def external_change_before_refresh(index, messages):
        if index == 2:
            conflict = next(item for item in messages if isinstance(item, ToolMessage) and item.tool_call_id == "conflict")
            assert json.loads(conflict.content)["error"]["code"] == "APP_UI_MODEL_HASH_CONFLICT"
            path = tmp_path / APP_UI_MODEL_PATH
            path.write_text(path.read_text(encoding="utf-8") + "\n", encoding="utf-8")

    agent, model = make_agent(client, [
        call("inspect_app_ui_model", {}, "initial"),
        mutation("conflict"),
        call("inspect_app_ui_model", {}, "fresh"),
        mutation("retry"),
        AIMessage(content="Composition committed after refreshing stale state."),
    ], before_response=external_change_before_refresh)
    result = run(agent)
    assert [item.callId for item in result.activities] == ["initial", "conflict", "fresh", "retry"]
    assert len(client.mutations) == result.app_ui_model_mutations.requests == 2
    assert client.mutations[0]["appUIModelHash"] != client.mutations[1]["appUIModelHash"]
    assert result.app_ui_model_mutations.hashConflicts == 1
    assert result.metrics.modelCalls == len(model.seen_messages) == 5
    assert result.metrics.batchPolicyViolations == 0
    assert agent.observations.snapshot()["appUIModel"]["hash"] == client.hash()


def test_creator_endpoint_preserves_parallel_tool_lifecycles(tmp_path, monkeypatch):
    client = BatchClient(tmp_path, barrier_size=2)
    model = BatchScriptModel(responses=[
        batch(call("inspect_app_ui_model", {}, "model-read"), call("list_ui_plugins", {}, "plugins-read")),
        AIMessage(content="Inspection complete."),
    ])
    monkeypatch.setenv("CREATOR_PYTHON_AGENT_MODE", "domain-write")
    monkeypatch.setattr(
        "agent_ui_creator.server.CreatorModelSettings.from_environment",
        classmethod(lambda cls, **kwargs: CreatorModelSettings(
            model_name="scripted-batch", base_url="http://unused.invalid/v1", api_key="unused-test-key"
        )),
    )
    monkeypatch.setattr("agent_ui_creator.model_factory.create_creator_chat_model", lambda *args, **kwargs: model)
    monkeypatch.setattr("agent_ui_creator.domain_agent.agent.ProjectControlClient", lambda **kwargs: client)
    settings = CreatorServerSettings(project_root=tmp_path, skills_root=tmp_path, auth_token="x" * 32)
    with TestClient(create_app(settings), headers={"Authorization": f"Bearer {settings.auth_token}"}) as http:
        response = http.post("/creator", json={
            "threadId": "batch-thread", "runId": "batch-run",
            "messages": [{"role": "user", "content": "Inspect current model and registered plugins."}],
        })

    assert response.status_code == 200
    events = [json.loads(line.removeprefix("data:")) for line in response.text.splitlines() if line.startswith("data:")]
    assert events[0]["type"] == "RUN_STARTED"
    assert events[-1]["type"] == "RUN_FINISHED"
    assert not any(event["type"] == "RUN_ERROR" for event in events)
    expected = {"model-read": "inspect_app_ui_model", "plugins-read": "list_ui_plugins"}
    starts = [event for event in events if event["type"] == "TOOL_CALL_START"]
    results = [event for event in events if event["type"] == "TOOL_CALL_RESULT"]
    assert len(starts) == len(results) == 2
    assert {event["toolCallId"]: event["toolCallName"] for event in starts} == expected
    assert {event["toolCallId"] for event in results} == set(expected)
    for call_id in expected:
        lifecycle = [event["type"] for event in events if event.get("toolCallId") == call_id]
        assert lifecycle == ["TOOL_CALL_START", "TOOL_CALL_ARGS", "TOOL_CALL_END", "TOOL_CALL_RESULT"]
        payload = json.loads(next(event["content"] for event in results if event["toolCallId"] == call_id))
        assert payload["ok"] is True
        if call_id == "model-read":
            assert payload["result"]["hash"] == client.hash()
        else:
            assert payload["result"]["registry"]["registeredPluginIds"] == ["session-manager"]
    result = events[-1]["result"]
    assert result["toolProtocol"]["modelCalls"] == 2
    assert result["toolProtocol"]["toolCalls"] == 2
    assert result["toolProtocol"]["batchPolicyViolations"] == 0
    assert result["projectControl"]["repeatedProjectControlReads"] == 0
    assert result["receipt"]["files"] == []
