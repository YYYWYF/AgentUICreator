from __future__ import annotations

import asyncio
import pytest

from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage

from agent_ui_creator.domain_agent import create_domain_read_creator_agent
from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.domain_agent.tool_policy import SIDE_EFFECT_TOOL_NAMES
from agent_ui_creator.minimal_agent.path_policy import (
    MinimalAgentPathPolicy,
    PolicyFilesystemBackend,
)
from agent_ui_creator.model_protocol.errors import ToolPermissionDeniedError


class OfferedToolsModel(FakeMessagesListChatModel):
    def bind_tools(self, tools, **kwargs):
        object.__setattr__(self, "offered", [tool.name for tool in tools])
        return self


def test_inspect_agent_offers_no_write_tools_and_cannot_edit_observed_source(tmp_path):
    target = tmp_path / "plugins" / "existing.ts"
    target.parent.mkdir()
    original = 'export const name = "original";\n'
    target.write_text(original)
    model = OfferedToolsModel(responses=[
        AIMessage(content="", tool_calls=[{
            "name": "read_file", "args": {"file_path": "/plugins/existing.ts"}, "id": "read",
        }]),
        AIMessage(content="", tool_calls=[{
            "name": "edit_file",
            "args": {"file_path": "/plugins/existing.ts", "old_string": "original", "new_string": "changed"},
            "id": "forbidden-edit",
        }]),
        AIMessage(content="The edit was rejected."),
    ])
    agent = create_domain_read_creator_agent(
        model=model, workspace=tmp_path, permission_scope="inspect_read_only",
    )
    with pytest.raises(ToolPermissionDeniedError, match="TOOL_PERMISSION_DENIED"):
        asyncio.run(agent.run("Inspect only."))
    assert not SIDE_EFFECT_TOOL_NAMES.intersection(model.offered)
    assert target.read_text() == original
    assert agent.activity.revision == 0


def test_inspect_backend_rejects_direct_write_after_read(tmp_path):
    target = tmp_path / "plugins" / "existing.ts"
    target.parent.mkdir()
    target.write_text('export const name = "original";\n')
    backend = PolicyFilesystemBackend(
        tmp_path, MinimalAgentPathPolicy.inspect_read_only(),
    )
    backend.read("/plugins/existing.ts")
    result = backend.edit(
        "/plugins/existing.ts", "original", "changed",
    )
    assert "TOOL_PERMISSION_DENIED" in str(result.error)
    assert target.read_text() == 'export const name = "original";\n'


def test_prior_edit_in_same_session_does_not_grant_inspect_write(tmp_path):
    target = tmp_path / "plugins" / "existing.ts"
    target.parent.mkdir()
    target.write_text('export const name = "original";\n')
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("same-session-write")
    writer = create_domain_read_creator_agent(
        model=OfferedToolsModel(responses=[
            AIMessage(content="", tool_calls=[{
                "name": "read_file", "args": {"file_path": "/plugins/existing.ts"}, "id": "read-1",
            }]),
            AIMessage(content="", tool_calls=[{
                "name": "edit_file", "args": {
                    "file_path": "/plugins/existing.ts", "old_string": "original", "new_string": "authorized",
                }, "id": "edit-1"}]),
            AIMessage(content="Done."),
        ]),
        workspace=tmp_path,
        activity=activity,
    )
    asyncio.run(writer.run("Authorized edit."))
    assert target.read_text() == 'export const name = "authorized";\n'
    activity.finish()
    activity.begin("same-session-inspect")
    reader = create_domain_read_creator_agent(
        model=OfferedToolsModel(responses=[
            AIMessage(content="", tool_calls=[{
                "name": "read_file", "args": {"file_path": "/plugins/existing.ts"}, "id": "read-2",
            }]),
            AIMessage(content="", tool_calls=[{
                "name": "edit_file", "args": {
                    "file_path": "/plugins/existing.ts", "old_string": "authorized", "new_string": "forbidden",
                }, "id": "edit-2"}]),
        ]),
        workspace=tmp_path,
        activity=activity,
        permission_scope="inspect_read_only",
    )
    with pytest.raises(ToolPermissionDeniedError, match="TOOL_PERMISSION_DENIED"):
        asyncio.run(reader.run("Inspect only."))
    assert target.read_text() == 'export const name = "authorized";\n'
