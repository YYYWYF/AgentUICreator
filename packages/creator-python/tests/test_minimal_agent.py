import asyncio

from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage

from agent_ui_creator.minimal_agent import create_minimal_creator_agent


class ToolCallingFakeModel(FakeMessagesListChatModel):
    def bind_tools(self, tools, **kwargs):
        object.__setattr__(self, "bound_tool_names", [tool.name for tool in tools])
        return self


def call(name, arguments, call_id):
    return AIMessage(
        content="",
        tool_calls=[{"name": name, "args": arguments, "id": call_id}],
    )


def test_fake_model_runs_read_edit_read_final_sequence(tmp_path):
    source = tmp_path / "src"
    source.mkdir()
    target = source / "activity.ts"
    target.write_text('export const activity = "old";\n', encoding="utf-8")
    model = ToolCallingFakeModel(
        responses=[
            call("read_file", {"file_path": "/src/activity.ts"}, "call-1"),
            call(
                "edit_file",
                {
                    "file_path": "/src/activity.ts",
                    "old_string": '"old"',
                    "new_string": '"new"',
                },
                "call-2",
            ),
            call("read_file", {"file_path": "/src/activity.ts"}, "call-3"),
            AIMessage(content="Updated and verified activity.ts."),
        ]
    )
    agent = create_minimal_creator_agent(
        model=model, workspace=tmp_path, mode="conformance"
    )

    result = asyncio.run(agent.run("Update activity.ts and verify it."))

    assert [activity.name for activity in result.activities] == [
        "read_file",
        "edit_file",
        "read_file",
    ]
    assert '"new"' in target.read_text(encoding="utf-8")
    assert result.metrics.modelCalls == 4
    assert set(model.bound_tool_names) == {"ls", "read_file", "glob", "grep", "edit_file"}


def test_fake_model_pseudo_edit_call_is_recovered(tmp_path):
    source = tmp_path / "src"
    source.mkdir()
    target = source / "activity.ts"
    target.write_text('export const activity = "old";\n', encoding="utf-8")
    model = ToolCallingFakeModel(
        responses=[
            call("read_file", {"file_path": "/src/activity.ts"}, "call-1"),
            AIMessage(
                content=[
                    {
                        "type": "text",
                        "name": "edit_file",
                        "args": {
                            "file_path": "/src/activity.ts",
                            "old_string": '"old"',
                            "new_string": '"new"',
                        },
                    }
                ]
            ),
            call("read_file", {"file_path": "/src/activity.ts"}, "call-3"),
            AIMessage(content="Updated and verified activity.ts."),
        ]
    )
    result = asyncio.run(
        create_minimal_creator_agent(
            model=model, workspace=tmp_path, mode="conformance"
        ).run("Update activity.ts and verify it.")
    )

    assert result.metrics.pseudoToolCallsDetected == 1
    assert result.metrics.pseudoToolCallsRecovered == 1
    assert '"new"' in target.read_text(encoding="utf-8")
