from unittest.mock import Mock
from types import SimpleNamespace

from langchain.agents.middleware import ModelRequest, ModelResponse
from langchain_core.messages import AIMessage

from agent_ui_creator.minimal_agent.tool_policy import (
    ALLOWED_MINIMAL_TOOLS,
    MinimalAgentToolPolicyMiddleware,
)


def test_minimal_tool_policy_filters_every_model_request():
    tools = [SimpleNamespace(name=name) for name in (
        "task",
        "write_todos",
        "execute",
        "write_file",
        "delete",
        *ALLOWED_MINIMAL_TOOLS,
    )]
    request = ModelRequest(model=Mock(), messages=[], tools=tools)
    observed = []

    def handler(filtered):
        observed.extend(tool.name for tool in filtered.tools)
        return ModelResponse(result=[AIMessage(content="done")])

    MinimalAgentToolPolicyMiddleware().wrap_model_call(request, handler)

    assert observed == list(ALLOWED_MINIMAL_TOOLS)
    assert not {"task", "write_todos", "execute", "write_file", "delete"} & set(observed)
