import json
from types import SimpleNamespace

import pytest
from langchain_openai import ChatOpenAI
from deepagents.profiles.harness.harness_profiles import _harness_profile_for_model

from agent_ui_creator.minimal_agent.agent import _register_minimal_harness_profile
from agent_ui_creator.domain_agent import create_domain_write_creator_agent
from agent_ui_creator.model_factory import create_creator_chat_model
from agent_ui_creator.model_settings import CreatorModelSettings
from agent_ui_creator.project_control import ProjectControlMetrics


@pytest.mark.parametrize('name', ['mimo-v2.5-pro', 'qwen/qwen3-coder-plus:free'])
def test_harness_profile_resolves_without_changing_provider_model_name(name):
    model = ChatOpenAI(model=name, api_key='test-only', base_url='https://model.example/v1')
    _register_minimal_harness_profile(model)
    profile = _harness_profile_for_model(model, None)
    assert model.model_name == name
    assert {'task', 'write_todos', 'execute', 'write_file', 'delete'} <= profile.excluded_tools
    assert 'SummarizationMiddleware' in profile.excluded_middleware
    assert profile.general_purpose_subagent.enabled is False


def test_colon_model_constructs_domain_agent_without_opencode_header(tmp_path):
    (tmp_path / '.agent-ui').mkdir()
    (tmp_path / '.agent-ui/project.json').write_text(json.dumps({'mode': 'assistant', 'sourceRoot': 'src/agent-ui'}))
    model = create_creator_chat_model(CreatorModelSettings(model_name='qwen/qwen3-coder-plus:free',
        api_key='test-only', base_url='https://model.example/v1'), thread_id='profile-test')
    agent = create_domain_write_creator_agent(model=model, workspace=tmp_path,
        project_control=SimpleNamespace(metrics=ProjectControlMetrics()))
    assert agent.graph is not None
    assert model.model_name == 'qwen/qwen3-coder-plus:free'
    assert 'x-opencode-session' not in model.default_headers
