from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage

from agent_ui_creator.domain_agent import (
    ALLOWED_DOMAIN_READ_TOOLS,
    create_domain_read_creator_agent,
)
from agent_ui_creator.model_protocol.errors import (
    AgentNoProgressError,
    ToolPermissionDeniedError,
)

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
TARGET_PROJECT = REPOSITORY_ROOT / "examples" / "agent-frontend"


class ToolCallingFakeModel(FakeMessagesListChatModel):
    def bind_tools(self, tools, **kwargs):
        object.__setattr__(self, "bound_tool_names", [tool.name for tool in tools])
        return self


def call(name, arguments, call_id):
    return AIMessage(
        content="",
        tool_calls=[{"name": name, "args": arguments, "id": call_id}],
    )


def test_domain_agent_uses_real_project_control_then_bounded_filesystem():
    model = ToolCallingFakeModel(
        responses=[
            call("inspect_ui_project", {}, "call-1"),
            call(
                "inspect_ui_plugin",
                {"pluginId": "workspace-inspector"},
                "call-2",
            ),
            call(
                "read_file",
                {"file_path": "/plugins/workspace-inspector/manifest.json"},
                "call-3",
            ),
            AIMessage(content="workspace-inspector inspected from authoritative state."),
        ]
    )
    agent = create_domain_read_creator_agent(
        model=model,
        workspace=TARGET_PROJECT,
    )

    result = asyncio.run(agent.run("Inspect workspace-inspector."))

    assert [activity.name for activity in result.activities] == [
        "inspect_ui_project",
        "inspect_ui_plugin",
        "read_file",
    ]
    assert result.project_control.requests == 2
    assert result.project_control.failures == 0
    assert result.metrics.modelCalls == 4
    assert set(model.bound_tool_names) == set(ALLOWED_DOMAIN_READ_TOOLS)
    assert "mutate_app_ui_model" not in model.bound_tool_names


def test_domain_agent_blocks_third_identical_project_control_read():
    model = ToolCallingFakeModel(
        responses=[
            call("inspect_ui_project", {}, "call-1"),
            call("inspect_ui_project", {}, "call-2"),
            call("inspect_ui_project", {}, "call-3"),
        ]
    )
    agent = create_domain_read_creator_agent(
        model=model,
        workspace=TARGET_PROJECT,
    )

    with pytest.raises(AgentNoProgressError):
        asyncio.run(agent.run("Repeat the broad inspection."))

    assert agent.repeated_read_guard.repeated_reads == 2
    assert agent.project_control.metrics.requests == 2


def test_domain_agent_cannot_edit_app_ui_model_to_bypass_read_only_control():
    model = ToolCallingFakeModel(
        responses=[
            call(
                "edit_file",
                {
                    "file_path": "/app-ui/app-ui.json",
                    "old_string": '"version": 1',
                    "new_string": '"version": 2',
                },
                "forbidden-1",
            ),
            AIMessage(content="Mutation unavailable."),
        ]
    )
    agent = create_domain_read_creator_agent(model=model, workspace=TARGET_PROJECT)

    with pytest.raises(ToolPermissionDeniedError):
        asyncio.run(agent.run("Mutate AppUIModel directly."))


@pytest.mark.parametrize(
    ("prompt", "responses", "expected_tools", "expected_model_calls"),
    [
        (
            "现在 Activity 相关的插件和 Slot 是什么状态？",
            [
                call("inspect_ui_project", {}, "activity-1"),
                call("inspect_ui_slots", {}, "activity-2"),
                AIMessage(content="Activity state inspected."),
            ],
            ["inspect_ui_project", "inspect_ui_slots"],
            3,
        ),
        (
            "workspace-inspector 现在有哪些 child slot？",
            [
                call(
                    "inspect_ui_plugin",
                    {"pluginId": "workspace-inspector"},
                    "slots-1",
                ),
                AIMessage(content="Child slots inspected."),
            ],
            ["inspect_ui_plugin"],
            2,
        ),
        (
            "Activity 插件源码入口在哪里？",
            [
                call(
                    "inspect_ui_plugin_source_references",
                    {"pluginId": "antd-x-activity-feed"},
                    "source-1",
                ),
                AIMessage(content="Source references inspected."),
            ],
            ["inspect_ui_plugin_source_references"],
            2,
        ),
    ],
)
def test_domain_read_golden_scenarios_are_targeted(
    prompt, responses, expected_tools, expected_model_calls
):
    model = ToolCallingFakeModel(responses=responses)
    agent = create_domain_read_creator_agent(model=model, workspace=TARGET_PROJECT)

    result = asyncio.run(agent.run(prompt))

    assert [activity.name for activity in result.activities] == expected_tools
    assert result.metrics.modelCalls == expected_model_calls
    assert all(
        activity.name not in {"edit_file", "mutate_app_ui_model"}
        for activity in result.activities
    )


def test_domain_agent_source_edit_finishes_with_undoable_receipt(tmp_path):
    plugins = tmp_path / "plugins"
    plugins.mkdir()
    target = plugins / "activity.ts"
    target.write_text('export const activity = "old";\n', encoding="utf-8")
    model = ToolCallingFakeModel(
        responses=[
            call("read_file", {"file_path": "/plugins/activity.ts"}, "read-1"),
            call(
                "edit_file",
                {
                    "file_path": "/plugins/activity.ts",
                    "old_string": '"old"',
                    "new_string": '"new"',
                },
                "edit-1",
            ),
            call("read_file", {"file_path": "/plugins/activity.ts"}, "read-2"),
            AIMessage(content="Source updated."),
        ]
    )
    agent = create_domain_read_creator_agent(model=model, workspace=tmp_path)
    agent.activity.begin("domain-edit-run")

    result = asyncio.run(agent.run("Update the plugin source."))
    receipt = agent.activity.finish()

    assert [activity.name for activity in result.activities] == [
        "read_file",
        "edit_file",
        "read_file",
    ]
    assert agent.activity.revision == 1
    assert receipt["files"] == [
        {
            "path": "plugins/activity.ts",
            "status": "modified",
            "diff": receipt["files"][0]["diff"],
            "truncated": False,
        }
    ]
    assert receipt["transaction"] == {
        "runId": "domain-edit-run",
        "undoable": True,
    }
    agent.activity.transactions.undo("domain-edit-run")
    assert target.read_text(encoding="utf-8") == 'export const activity = "old";\n'


def test_plain_file_read_does_not_reset_repeated_domain_read_epoch(tmp_path):
    plugins = tmp_path / "plugins"
    plugins.mkdir()
    (plugins / "foo.ts").write_text("export {};\n", encoding="utf-8")
    model = ToolCallingFakeModel(
        responses=[
            call("inspect_ui_project", {}, "domain-1"),
            call("read_file", {"file_path": "/plugins/foo.ts"}, "file-1"),
            call("inspect_ui_project", {}, "domain-2"),
            call("inspect_ui_project", {}, "domain-3"),
        ]
    )
    agent = create_domain_read_creator_agent(model=model, workspace=tmp_path)

    with pytest.raises(AgentNoProgressError):
        asyncio.run(agent.run("Repeat without a mutation."))

    assert agent.repeated_read_guard.repeated_reads == 2
