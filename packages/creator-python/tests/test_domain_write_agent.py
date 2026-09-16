from __future__ import annotations

import asyncio
import json
from pathlib import Path

from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage
from pydantic import Field

from agent_ui_creator.domain_agent import (
    ALLOWED_DOMAIN_WRITE_TOOLS,
    create_domain_write_creator_agent,
)
from agent_ui_creator.files import read_creator_file_state
from agent_ui_creator.project_control import ProjectControlError, ProjectControlMetrics

APP_UI_MODEL_PATH = "app-ui/app-ui.json"
REGISTRY_PATH = "plugins/registry.generated.ts"


class ToolCallingFakeModel(FakeMessagesListChatModel):
    def bind_tools(self, tools, **kwargs):
        object.__setattr__(self, "bound_tool_names", [tool.name for tool in tools])
        return self


def call(name, arguments, call_id):
    return AIMessage(
        content="",
        tool_calls=[{"name": name, "args": arguments, "id": call_id}],
    )


def _project(tmp_path: Path) -> Path:
    (tmp_path / "app-ui").mkdir()
    (tmp_path / "plugins").mkdir()
    (tmp_path / APP_UI_MODEL_PATH).write_text(
        '{"root":{"type":"slot","id":"inspector-activity","description":"Inspector activity.","plugins":[]}}\n',
        encoding="utf-8",
    )
    (tmp_path / REGISTRY_PATH).write_text(
        "export const pluginDefinitions = [];\n", encoding="utf-8"
    )
    return tmp_path


class MutationClient:
    def __init__(self, root: Path):
        self.root = root
        self.metrics = ProjectControlMetrics()
        self.inspect_calls = 0
        self.mutation_calls = 0

    async def inspect_app_ui_model(self):
        self.inspect_calls += 1
        self.metrics.record("inspect_app_ui_model", 1, False)
        return {
            "schemaVersion": 3,
            "hash": read_creator_file_state(self.root, APP_UI_MODEL_PATH).hash,
            "model": json.loads(
                (self.root / APP_UI_MODEL_PATH).read_text(encoding="utf-8")
            ),
        }

    async def request_app_ui_model_mutation(self, input):
        self.mutation_calls += 1
        self.metrics.record("mutate_app_ui_model", 1, False)
        before_hash = read_creator_file_state(self.root, APP_UI_MODEL_PATH).hash
        model = json.loads((self.root / APP_UI_MODEL_PATH).read_text(encoding="utf-8"))
        model["root"]["plugins"].append({
            "id": "agent-activity-feed-main",
            "pluginId": "antd-x-activity-feed",
            "enabled": True,
        })
        (self.root / APP_UI_MODEL_PATH).write_text(
            json.dumps(model, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        after_hash = read_creator_file_state(self.root, APP_UI_MODEL_PATH).hash
        return {
            "schemaVersion": 1,
            "transactionId": "golden-transaction",
            "changed": True,
            "changedPaths": [APP_UI_MODEL_PATH],
            "appUIModel": {"beforeHash": before_hash, "afterHash": after_hash},
            "snapshotToken": {
                "appUIModelHash": after_hash,
                "capabilityCatalogSourceHash": read_creator_file_state(
                    self.root, REGISTRY_PATH
                ).hash,
            },
        }

    async def inspect_ui_project(self):
        raise AssertionError("broad inspection was not needed")

    async def list_ui_plugins(self):
        raise AssertionError("plugin list was not needed")

    async def inspect_ui_slots(self, *, root=None):
        raise AssertionError("slot inspection was not needed")

    async def inspect_ui_plugin(self, plugin_id):
        raise AssertionError("plugin inspection was not needed")

    async def inspect_ui_plugin_source_references(self, plugin_id):
        raise AssertionError("source inspection was not needed")


class TerminalBlockerMutationClient(MutationClient):
    async def request_app_ui_model_mutation(self, _input):
        self.mutation_calls += 1
        self.metrics.record("mutate_app_ui_model", 1, True)
        raise ProjectControlError(
            "PLUGIN_CHILD_SLOT_CONTRACT_INVALID",
            "Selected plugins contain inconsistent child Slots.",
            {"pluginId": "conversation-surface"},
        )


class NoNextModel(ToolCallingFakeModel):
    model_calls: list[None] = Field(default_factory=list)

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        if len(self.model_calls) >= len(self.responses):
            raise AssertionError("model must not be called after a terminal blocker")
        self.model_calls.append(None)
        return super()._generate(
            messages,
            stop=stop,
            run_manager=run_manager,
            **kwargs,
        )


def test_domain_write_golden_scenario_uses_inspect_then_one_atomic_mutation(tmp_path):
    root = _project(tmp_path)
    client = MutationClient(root)
    model = ToolCallingFakeModel(
        responses=[
            call("inspect_app_ui_model", {}, "inspect-1"),
            call(
                "mutate_app_ui_model",
                {
                    "operations": [
                        {
                            "type": "insert_plugin",
                            "plugin": {
                                "id": "agent-activity-feed-main",
                                "pluginId": "antd-x-activity-feed",
                                "enabled": True,
                            },
                            "target": {
                                "type": "layout_slot",
                                "slotNodeId": "inspector-activity",
                            },
                        }
                    ],
                },
                "mutate-1",
            ),
            AIMessage(content="AppUIModel static composition committed; runtime verification was not run."),
        ]
    )
    agent = create_domain_write_creator_agent(
        model=model,
        workspace=root,
        project_control=client,
    )
    agent.activity.begin("domain-write-golden")

    result = asyncio.run(agent.run("Register activity feed in inspector.activity."))
    receipt = agent.activity.finish()

    assert [activity.name for activity in result.activities] == [
        "inspect_app_ui_model",
        "mutate_app_ui_model",
    ]
    assert result.metrics.modelCalls == 3
    assert result.metrics.toolCalls == 2
    assert client.inspect_calls == 1
    assert client.mutation_calls == 1
    assert not any(activity.name == "edit_file" for activity in result.activities)
    assert set(model.bound_tool_names) == set(ALLOWED_DOMAIN_WRITE_TOOLS)
    assert result.app_ui_model_mutations.to_dict() == {
        "requests": 1,
        "operations": 1,
        "hashConflicts": 0,
        "changedPaths": 1,
        "resultMismatches": 0,
        "operationsPerMutation": [1],
        "successfulRequests": 1,
        "errorCategories": {},
        "semanticReplans": 0,
        "semanticFailures": 0,
        "semanticReplanLimitReached": False,
        "multiSuccessfulMutationRun": False,
    }
    assert result.domain_observations.to_dict() == {
        "updates": 2,
        "hashReuses": 1,
        "invalidations": 0,
        "observationRequiredErrors": 0,
        "explicitHashMatches": 0,
        "explicitHashMismatches": 0,
    }
    assert receipt["files"][0]["path"] == APP_UI_MODEL_PATH
    assert result.change_layer_metrics["taskChangeLayer"] == "composition"
    assert result.change_layer_metrics["appUIModelMutationAttempts"] == 1
    assert result.change_layer_metrics["sourceWrites"] == 0
    assert receipt["transaction"]["undoable"] is True
    assert receipt["verification"]["status"] == "failed"


def test_workspace_integrity_terminal_blocker_stops_before_next_model_call(tmp_path):
    root = _project(tmp_path)
    client = TerminalBlockerMutationClient(root)
    model = NoNextModel(
        responses=[
            call("inspect_app_ui_model", {}, "inspect-1"),
            call(
                "mutate_app_ui_model",
                {
                    "operations": [
                        {"type": "remove_plugin", "instanceId": "history-main"}
                    ]
                },
                "mutate-1",
            ),
        ]
    )
    agent = create_domain_write_creator_agent(
        model=model,
        workspace=root,
        project_control=client,
    )
    agent.activity.begin("domain-write-terminal-blocker")

    result = asyncio.run(agent.run("移除左侧历史会话。"))

    assert result.completion == "blocked"
    assert result.blocker is not None
    assert result.blocker["source"] == "mutate_app_ui_model"
    assert result.metrics.modelCalls == len(model.model_calls) == 2
    assert result.metrics.toolCalls == 2
    assert client.inspect_calls == 1
    assert client.mutation_calls == 1
    assert result.terminal_metrics["terminalBlockerCount"] == 1
    assert result.terminal_metrics["modelCallsAfterTerminalBlocker"] == 0
    assert result.terminal_metrics["toolCallsAfterTerminalBlocker"] == 0
