import json

from langchain.agents.middleware import ModelRequest
from langchain_core.messages import HumanMessage, SystemMessage
from unittest.mock import Mock

from agent_ui_creator.domain_agent.project_context import CreatorProjectContextMiddleware


def test_current_context_uses_actual_source_root_and_replaces_old_snapshot(tmp_path):
    config = tmp_path / ".agent-ui"
    config.mkdir()
    (config / "project.json").write_text(
        json.dumps({"mode": "assistant", "sourceRoot": "src/agent-ui"}),
        encoding="utf-8",
    )
    middleware = CreatorProjectContextMiddleware(
        tmp_path, permission="inspect_read_only", verification_mode="static_only",
    )
    request = ModelRequest(model=Mock(), messages=[
        SystemMessage(content="CREATOR_CURRENT_PROJECT_CONTEXT_V1 old"),
        HumanMessage(content="inspect"),
    ], tools=[])
    prepared = middleware._request(request)
    assert len(prepared.messages) == 2
    assert '"sourceRoot":"/src/agent-ui"' in prepared.messages[0].content
    assert "old" not in prepared.messages[0].content
    assert prepared.messages[1].content == "inspect"

    (config / "project.json").write_text(
        json.dumps({"mode": "assistant", "sourceRoot": "ui"}), encoding="utf-8",
    )
    refreshed = middleware._request(prepared)
    assert len(refreshed.messages) == 2
    assert '"sourceRoot":"/ui"' in refreshed.messages[0].content
