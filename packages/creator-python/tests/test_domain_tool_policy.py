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
    assert "assistant-ui may be an upstream design reference only" not in DOMAIN_WRITE_AGENT_PROMPT
    assert "Reuse the project's existing\nConversation Runtime" in DOMAIN_WRITE_AGENT_PROMPT
    assert "Plugins must not create another Runtime" in DOMAIN_WRITE_AGENT_PROMPT


def test_ag_ui_skill_declares_only_available_tools():
    skill = (SKILLS_ROOT / "ag-ui-frontend" / "SKILL.md").read_text()
    allowed_line = next(line for line in skill.splitlines() if line.startswith("allowed-tools:"))
    declared = set(allowed_line.partition(":")[2].split())
    assert declared <= set(ALLOWED_DOMAIN_WRITE_TOOLS)
    assert not {"write_file", "execute"}.intersection(declared)


def test_plugin_skill_runtime_instructions_follow_verification_mode():
    skill = (SKILLS_ROOT / "ui-plugin-development" / "SKILL.md").read_text()
    assert "In `static_and_runtime` mode, call `inspect_runtime_errors`" in skill
    assert "In `static_only` mode, stop after current-revision static validation" in skill


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
