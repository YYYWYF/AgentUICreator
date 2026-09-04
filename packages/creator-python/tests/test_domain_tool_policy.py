from types import SimpleNamespace
from unittest.mock import Mock

from langchain.agents.middleware import ModelRequest, ModelResponse
from langchain_core.messages import AIMessage

from agent_ui_creator.domain_agent import (
    ALLOWED_DOMAIN_READ_TOOLS,
    DomainReadToolPolicyMiddleware,
)


def test_domain_read_policy_exposes_only_filesystem_and_read_domain_tools():
    tools = [
        SimpleNamespace(name=name)
        for name in (
            "task",
            "execute",
            "write_todos",
            "mutate_app_ui_model",
            *ALLOWED_DOMAIN_READ_TOOLS,
        )
    ]
    request = ModelRequest(model=Mock(), messages=[], tools=tools)
    observed = []

    def handler(filtered):
        observed.extend(tool.name for tool in filtered.tools)
        return ModelResponse(result=[AIMessage(content="done")])

    DomainReadToolPolicyMiddleware().wrap_model_call(request, handler)

    assert observed == list(ALLOWED_DOMAIN_READ_TOOLS)
    assert "mutate_app_ui_model" not in observed

