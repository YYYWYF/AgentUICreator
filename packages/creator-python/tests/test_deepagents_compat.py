import asyncio
import json

import httpx
import pytest
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage, ToolMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

from agent_ui_creator.domain_agent import (
    create_domain_read_creator_agent,
    create_domain_write_creator_agent,
)
from agent_ui_creator.minimal_agent.agent import create_minimal_creator_agent
from agent_ui_creator.minimal_agent.tool_policy import tool_name
from agent_ui_creator.model_factory import create_creator_chat_model
from agent_ui_creator.model_settings import CreatorModelSettings
from agent_ui_creator.streaming import DeepAgentV3Runner
from agent_ui_creator.streaming.deepagent_v3_runner import DeepAgentCompleted, DeepAgentInterrupted


class ToolCallingModel(FakeMessagesListChatModel):
    def bind_tools(self, tools, **kwargs):
        return self


@pytest.mark.parametrize("scope", ["minimal", "inspect", "answer", "write"])
def test_creator_modes_stream_with_pinned_deepagents_and_preserve_permissions(tmp_path, scope):
    (tmp_path / ".agent-ui").mkdir()
    (tmp_path / ".agent-ui/project.json").write_text(json.dumps({
        "mode": "assistant", "sourceRoot": "src/agent-ui",
    }))
    offered = []

    class CapturingModel(FakeMessagesListChatModel):
        def bind_tools(self, tools, **kwargs):
            offered.append({tool_name(tool) for tool in tools})
            return self

    model = CapturingModel(responses=[AIMessage(content="Hello.")])
    if scope == "minimal":
        agent = create_minimal_creator_agent(model=model, workspace=tmp_path)
    elif scope == "write":
        agent = create_domain_write_creator_agent(model=model, workspace=tmp_path)
    else:
        agent = create_domain_read_creator_agent(
            model=model, workspace=tmp_path,
            permission_scope="inspect_read_only", answer_only=scope == "answer",
        )
    result = asyncio.run(DeepAgentV3Runner().run(
        graph=agent.graph,
        input={"messages": [{"role": "user", "content": "Hello"}]},
        config={"recursion_limit": 5}, event_sink=None,
    ))
    assert result["messages"][-1].text == "Hello."
    if scope == "answer":
        # With no tools create_agent can skip bind_tools entirely.
        assert all(not tools for tools in offered)
    else:
        assert offered
        for tools in offered:
            assert {"ls", "read_file", "glob", "grep"} <= tools
            assert not {"write_file", "execute", "delete", "task", "write_todos"} & tools
            assert ("edit_file" in tools) == (scope in {"minimal", "write"})


def test_compat_filesystem_executes_read_then_edit(tmp_path):
    source = tmp_path / "sample.txt"
    source.write_text("before\n")
    model = ToolCallingModel(responses=[
        AIMessage(content="", tool_calls=[{
            "name": "read_file", "args": {"file_path": "/sample.txt"}, "id": "read-1",
        }]),
        AIMessage(content="", tool_calls=[{
            "name": "edit_file", "args": {
                "file_path": "/sample.txt", "old_string": "before", "new_string": "after",
            }, "id": "edit-1",
        }]),
        AIMessage(content="Done."),
    ])
    agent = create_minimal_creator_agent(model=model, workspace=tmp_path, mode="conformance")
    result = asyncio.run(DeepAgentV3Runner().run(
        graph=agent.graph, input={"messages": [{"role": "user", "content": "Edit sample"}]},
        config={"recursion_limit": 10}, event_sink=None,
    ))
    assert source.read_text() == "after\n"
    outputs = [message for message in result["messages"] if isinstance(message, ToolMessage)]
    assert [message.tool_call_id for message in outputs] == ["read-1", "edit-1"]
    assert all(message.status == "success" for message in outputs)


def test_compat_inspect_question_interrupts_and_resumes(tmp_path):
    async def scenario():
        (tmp_path / ".agent-ui").mkdir()
        (tmp_path / ".agent-ui/project.json").write_text(json.dumps({
            "mode": "assistant", "sourceRoot": "src/agent-ui",
        }))
        question = {"steps": [{
            "id": "layout", "question": "Layout?", "selectionMode": "single",
            "minSelections": 1, "maxSelections": 1,
            "options": [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}],
        }]}
        model = ToolCallingModel(responses=[
            AIMessage(content="", tool_calls=[{
                "name": "ask_user_question", "args": question, "id": "ask-1",
            }]),
            AIMessage(content="Done."),
        ])
        agent = create_domain_read_creator_agent(
            model=model, workspace=tmp_path, permission_scope="inspect_read_only",
            checkpointer=InMemorySaver(),
        )
        runner = DeepAgentV3Runner()
        config = {"recursion_limit": 10, "configurable": {"thread_id": "compat-resume"}}
        paused = await runner.run_result(
            graph=agent.graph, input={"messages": [{"role": "user", "content": "Ask"}]},
            config=config, event_sink=None,
        )
        assert isinstance(paused, DeepAgentInterrupted)
        assert paused.interrupts[0]["value"]["kind"] == "ask_user_question"
        completed = await runner.run_result(
            graph=agent.graph, input=Command(resume={"answers": {"layout": ["b"]}}),
            config=config, event_sink=None,
        )
        assert isinstance(completed, DeepAgentCompleted)
        assert completed.state["messages"][-1].content == "Done."

    asyncio.run(scenario())


def test_compat_write_agent_keeps_skills_in_model_context(tmp_path):
    (tmp_path / ".agent-ui").mkdir()
    (tmp_path / ".agent-ui/project.json").write_text(json.dumps({
        "mode": "assistant", "sourceRoot": "src/agent-ui",
    }))
    skills = tmp_path / "skills"
    skill = skills / "compat-check"
    skill.mkdir(parents=True)
    (skill / "SKILL.md").write_text(
        "---\nname: compat-check\ndescription: compatibility sentinel\n---\nRead the project.\n",
    )
    prompts = []

    class CapturingModel(ToolCallingModel):
        def _generate(self, messages, **kwargs):
            prompts.extend(str(message.content) for message in messages if message.type == "system")
            return super()._generate(messages, **kwargs)

    agent = create_domain_write_creator_agent(
        model=CapturingModel(responses=[AIMessage(content="Hello.")]),
        workspace=tmp_path, skills_root=skills,
    )
    agent.graph.invoke({"messages": [{"role": "user", "content": "Hello"}]})
    assert any("compatibility sentinel" in prompt for prompt in prompts)


def test_compat_uses_openai_chat_completions_stream(tmp_path):
    requests = []

    def provider(request):
        requests.append((request.url.path, json.loads(request.content)))
        chunks = [
            {"id": "chat-compat", "object": "chat.completion.chunk", "created": 1,
             "model": "compat-model", "choices": [{"index": 0,
                 "delta": {"role": "assistant", "content": "Hello."}, "finish_reason": None}]},
            {"id": "chat-compat", "object": "chat.completion.chunk", "created": 1,
             "model": "compat-model", "choices": [{"index": 0,
                 "delta": {}, "finish_reason": "stop"}]},
        ]
        return httpx.Response(200, headers={"Content-Type": "text/event-stream"},
            text="".join(f"data: {json.dumps(chunk)}\n\n" for chunk in chunks) + "data: [DONE]\n\n")

    transport = httpx.MockTransport(provider)
    model = create_creator_chat_model(
        CreatorModelSettings(model_name="compat-model", api_key="test-only", base_url="https://model.example/v1"),
        http_transport=transport, http_async_transport=transport,
    )
    agent = create_minimal_creator_agent(model=model, workspace=tmp_path, mode="conformance")
    result = asyncio.run(DeepAgentV3Runner().run(
        graph=agent.graph, input={"messages": [{"role": "user", "content": "Hello"}]},
        config={"recursion_limit": 5}, event_sink=None,
    ))
    assert result["messages"][-1].text == "Hello."
    assert len(requests) == 1
    path, body = requests[0]
    assert path == "/v1/chat/completions"
    assert body["stream"] is True
    assert body["model"] == "compat-model"
    assert {tool["function"]["name"] for tool in body["tools"]} == {
        "ls", "read_file", "glob", "grep", "edit_file",
    }
