"""Long, progressing tasks must not be mistaken for an unproductive loop."""
import asyncio
import json
import math

import pytest
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage

from agent_ui_creator.domain_agent import create_domain_read_creator_agent, create_domain_write_creator_agent
from agent_ui_creator.minimal_agent.agent import create_minimal_creator_agent
from agent_ui_creator.streaming import DeepAgentV3Runner


class ToolCallingModel(FakeMessagesListChatModel):
    def bind_tools(self, tools, **kwargs):
        return self


def progressing_agent(tmp_path, scope, rounds=40):
    metadata = tmp_path / ".agent-ui"
    metadata.mkdir()
    (metadata / "project.json").write_text(json.dumps({"mode": "assistant", "sourceRoot": "src/agent-ui"}))
    directory = tmp_path / "src/agent-ui/plugins/custom"
    directory.mkdir(parents=True)
    responses = []
    for index in range(rounds):
        (directory / f"part-{index}.txt").write_text(f"Part {index}\n")
        responses.append(AIMessage(content="", tool_calls=[{
            "name": "read_file",
            "args": {"file_path": f"/src/agent-ui/plugins/custom/part-{index}.txt"},
            "id": f"read-{index}",
        }]))
    final = "[creator-verification:read-only] Inspection complete." if scope == "write" else "Inspection complete."
    model = ToolCallingModel(responses=[*responses, AIMessage(content=final)])
    if scope == "minimal":
        return create_minimal_creator_agent(model=model, workspace=tmp_path, mode="conformance")
    if scope == "inspect":
        return create_domain_read_creator_agent(model=model, workspace=tmp_path, permission_scope="inspect_read_only")
    return create_domain_write_creator_agent(model=model, workspace=tmp_path)


@pytest.mark.parametrize("scope", ["minimal", "inspect", "write"])
def test_progressing_task_exceeds_both_old_model_and_graph_limits(tmp_path, scope):
    agent = progressing_agent(tmp_path, scope)
    result = asyncio.run(agent.run("Read each part and report completion."))
    assert result.text == "Inspection complete."
    assert result.metrics.modelCalls == 41
    assert len(result.activities) == 40
    assert all(activity.status == "success" for activity in result.activities)
    # The factory must also override the underlying library's finite default.
    assert math.isinf(agent.graph.config["recursion_limit"])


def test_streaming_runner_does_not_restore_a_finite_call_site_limit(tmp_path):
    agent = progressing_agent(tmp_path, "minimal")
    state = asyncio.run(DeepAgentV3Runner().run(
        graph=agent.graph, input={"messages": [{"role": "user", "content": "Read every part."}]},
        config={"recursion_limit": 1}, event_sink=None,
    ))
    assert state["messages"][-1].text == "Inspection complete."
    assert agent.protocol.metrics.modelCalls == 41
