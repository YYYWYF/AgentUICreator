from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

from langchain.agents.middleware import ModelRequest, ModelResponse
from langchain_core.messages import AIMessage

from agent_ui_creator.domain_agent import (
    ALLOWED_DOMAIN_READ_TOOLS,
    ALLOWED_DOMAIN_WRITE_TOOLS,
    DomainReadToolPolicyMiddleware,
    DomainWriteToolPolicyMiddleware,
)
from agent_ui_creator.domain_agent.tool_policy import RUNTIME_VERIFICATION_TOOL_NAMES
from agent_ui_creator.domain_agent.prompt import DOMAIN_WRITE_AGENT_PROMPT


SKILLS_ROOT = Path(__file__).resolve().parents[2] / "creator" / "skills"


def test_conversation_ownership_prompt_reuses_project_runtime():
    assert "The generated project owns its Agent Runtime" in DOMAIN_WRITE_AGENT_PROMPT
    assert "do not add Creator to the generated app" in DOMAIN_WRITE_AGENT_PROMPT


def test_ag_ui_skill_does_not_claim_tool_permissions():
    skill = (SKILLS_ROOT / "ag-ui-frontend" / "SKILL.md").read_text()
    assert "allowed-tools:" not in skill


def test_plugin_skill_runtime_instructions_follow_verification_mode():
    skill = (SKILLS_ROOT / "ui-plugin-development" / "SKILL.md").read_text()
    detail = (SKILLS_ROOT / "ui-plugin-development" / "references" / "completion-loop.md").read_text()
    assert "completion-loop.md" in skill
    assert "static_and_runtime" in detail
    assert "static_only" in detail


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

    assert observed == [
        name
        for name in ALLOWED_DOMAIN_READ_TOOLS
        if name not in RUNTIME_VERIFICATION_TOOL_NAMES
    ]
    assert "mutate_app_ui_model" not in observed


def test_domain_write_policy_adds_only_semantic_mutation_to_read_surface():
    tools = [
        SimpleNamespace(name=name)
        for name in ("task", "execute", "write_todos", *ALLOWED_DOMAIN_WRITE_TOOLS)
    ]
    request = ModelRequest(model=Mock(), messages=[], tools=tools)
    observed = []

    def handler(filtered):
        observed.extend(tool.name for tool in filtered.tools)
        return ModelResponse(result=[AIMessage(content="done")])

    DomainWriteToolPolicyMiddleware().wrap_model_call(request, handler)

    assert observed == [
        name
        for name in ALLOWED_DOMAIN_WRITE_TOOLS
        if name not in RUNTIME_VERIFICATION_TOOL_NAMES
    ]
    assert "mutate_app_ui_model" in observed
    assert "apply_agent_ui_source_item" in observed
    assert not {"task", "execute", "write_todos", "write_file"}.intersection(observed)


def test_explicit_runtime_mode_restores_runtime_verification_tools():
    tools = [
        SimpleNamespace(name=name)
        for name in ALLOWED_DOMAIN_WRITE_TOOLS
    ]
    request = ModelRequest(model=Mock(), messages=[], tools=tools)
    observed = []

    def handler(filtered):
        observed.extend(tool.name for tool in filtered.tools)
        return ModelResponse(result=[AIMessage(content="done")])

    DomainWriteToolPolicyMiddleware("static_and_runtime").wrap_model_call(
        request, handler
    )

    assert observed == list(ALLOWED_DOMAIN_WRITE_TOOLS)
    assert RUNTIME_VERIFICATION_TOOL_NAMES.issubset(observed)
