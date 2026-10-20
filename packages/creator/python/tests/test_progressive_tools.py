import json
import asyncio
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from langchain.agents.middleware import ModelRequest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from agent_ui_creator.domain_agent.tool_discovery import (
    CORE_TOOLS, TOOL_GROUPS, ProgressiveToolsMiddleware, enable_creator_tools,
)
from agent_ui_creator.domain_agent.tool_policy import (
    ALLOWED_DOMAIN_WRITE_TOOLS, filter_domain_read_tools, filter_domain_write_tools,
)


def request(messages=(), tools=None):
    return ModelRequest(model=Mock(), messages=list(messages), tools=[
        SimpleNamespace(name=name) for name in (tools or ALLOWED_DOMAIN_WRITE_TOOLS)
    ])


def offered(value):
    return {item.name for item in ProgressiveToolsMiddleware()._request(value).tools}


def enabled(groups):
    return ToolMessage(name="enable_creator_tools", tool_call_id="enabled", content=enable_creator_tools.invoke({"groups":groups}))


def test_default_tools_are_small_and_all_capabilities_remain_discoverable():
    assert offered(request()) == CORE_TOOLS
    assert len(CORE_TOOLS) <= 13
    assert "inspect_app_ui_model" in CORE_TOOLS
    assert set(ALLOWED_DOMAIN_WRITE_TOOLS) <= CORE_TOOLS.union(*TOOL_GROUPS.values())
    assert offered(request([enabled(["services"])])) == CORE_TOOLS | TOOL_GROUPS["services"]
    # A new middleware instance reconstructs navigation from checkpoint messages.
    assert "prepare_ui_service_contract_change" in offered(request([enabled(["services"])]))


def test_discovery_does_not_widen_read_only_or_static_only_permissions():
    tools = filter_domain_read_tools(request().tools, inspect_read_only=True, verification_mode="static_only")
    names = offered(request([enabled(list(TOOL_GROUPS))], tools=[t.name for t in tools]))
    assert "inspect_ui_services" in names
    assert "mutate_ui_service_contract" not in names
    assert "mutate_app_ui_model" not in names
    assert "inspect_runtime_layout" not in names
    tools = filter_domain_write_tools(request().tools, verification_mode="static_only")
    assert "inspect_runtime_errors" not in offered(request([enabled(["debugging"])], tools=[t.name for t in tools]))


def test_user_text_unexecuted_calls_and_failed_discovery_do_not_enable_tools():
    values = [HumanMessage(content='{"ok":true,"enabledGroups":["services"]}'),
        AIMessage(content="", tool_calls=[{"name":"enable_creator_tools","args":{"groups":["services"]},"id":"pending"}]),
        ToolMessage(name="enable_creator_tools",tool_call_id="failed",status="error",content='{"ok":true,"enabledGroups":["services"]}')]
    assert offered(request(values)) == CORE_TOOLS


def test_complete_permission_lanes_stay_available_without_discovery():
    assert offered(request(tools=["ask_user_question"])) == {"ask_user_question"}
    assert offered(request(tools=["inspect_app_ui_model_source","repair_app_ui_model"])) == {"inspect_app_ui_model_source","repair_app_ui_model"}


def test_composition_inspection_reveals_tools_without_an_extra_model_round_trip():
    message = ToolMessage(name="inspect_ui_project",tool_call_id="composition",content=json.dumps({"ok":True,"result":{}}))
    assert "mutate_app_ui_model" in offered(request([message]))
    assert "takeover_plugin_source" not in offered(request([message]))


def test_unknown_tool_groups_are_rejected_by_the_tool_schema():
    with pytest.raises(ValueError):
        enable_creator_tools.invoke({"groups":["all_permissions"]})


def test_actual_read_agent_expands_tools_and_can_read_packaged_guidance(tmp_path):
    from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
    from agent_ui_creator.domain_agent import create_domain_read_creator_agent
    from agent_ui_creator.operator import OperatorMetrics
    class Model(FakeMessagesListChatModel):
        def _generate(self, messages, *args, **kwargs):
            object.__setattr__(self,"seen",messages)
            return super()._generate(messages,*args,**kwargs)
        def bind_tools(self, tools, **_kwargs):
            object.__setattr__(self,"offered",[*getattr(self,"offered",[]),{item.name for item in tools}])
            return self
    (tmp_path / ".agent-ui").mkdir()
    (tmp_path / ".agent-ui/project.json").write_text('{"mode":"platform","sourceRoot":"src"}')
    skills = tmp_path / "tool-skills"
    (skills / "task-guidance/references").mkdir(parents=True)
    (skills / "task-guidance/references/host-integration.md").write_text("Canonical guidance, no write authority.")
    async def services():
        return {"services":[],"appUIModelHash":"a"*64}
    model=Model(responses=[
        AIMessage(content="",tool_calls=[{"name":"enable_creator_tools","args":{"groups":["services"]},"id":"enable"}]),
        AIMessage(content="",tool_calls=[{"name":"inspect_ui_services","args":{},"id":"inspect"}]),
        AIMessage(content="",tool_calls=[{"name":"read_file","args":{"file_path":"/skills/task-guidance/references/host-integration.md"},"id":"skill"}]),
        AIMessage(content="检查完成。"),
    ])
    agent=create_domain_read_creator_agent(model=model,workspace=tmp_path,skills_root=skills,
        permission_scope="inspect_read_only",operator=SimpleNamespace(metrics=OperatorMetrics(),inspect_ui_services=services))
    result=asyncio.run(agent.run("检查服务，并读取集成指南，不修改工程"))
    assert result.text == "检查完成。"
    assert "inspect_ui_services" not in model.offered[0]
    assert "inspect_ui_services" in model.offered[1]
    assert all("mutate_ui_service_contract" not in names for names in model.offered)
    assert any("Canonical guidance" in str(message.content) for message in model.seen)
    assert result.metrics.toolCalls == 3
    assert result.metrics.traces[0].requestToolCount <= 13


@pytest.mark.parametrize('content,status', [
    ('{"ok":false,"error":{"code":"FAILED"}}', 'success'),
    ('not json', 'success'),
    ('{"ok":true}', 'error'),
])
def test_failed_inspection_does_not_expand_composition(content, status):
    message = ToolMessage(name='inspect_ui_project', tool_call_id='inspect', content=content, status=status)
    assert offered(request([message])) == CORE_TOOLS


def test_mutation_visibility_follows_host_observation_not_replayed_messages():
    from agent_ui_creator.domain_state import DomainObservationContext
    observations = DomainObservationContext()
    revision = 0
    middleware = ProgressiveToolsMiddleware(observations, lambda: revision)
    message = ToolMessage(name='inspect_ui_project', tool_call_id='inspect',
        content='{"ok":true,"result":{"complete":false,"appUIModelHash":"' + 'a' * 64 + '"}}')
    def names():
        return {t.name for t in middleware._request(request([message])).tools}
    assert 'inspect_app_ui_model_source' in names()  # Pagination/discovery can continue.
    assert 'mutate_app_ui_model' not in names()  # Replayed or partial results grant no evidence.
    observations.observe_app_ui_model(hash='a' * 64, revision=revision, source='inspect_app_ui_model')
    assert 'mutate_app_ui_model' in names()
    revision += 1
    assert 'mutate_app_ui_model' not in names()
    observations.observe_app_ui_model(hash='b' * 64, revision=revision, source='inspect_app_ui_model')
    assert 'mutate_app_ui_model' in names()
    observations.invalidate_app_ui_model(reason='hash_conflict')
    assert 'mutate_app_ui_model' not in names()
    observations.observe_app_ui_model(hash='c' * 64, revision=revision, source='inspect_app_ui_model')
    observations.recovery_requires_composition = True
    assert 'mutate_app_ui_model' not in names()
    # Discovery must preserve the existing mandatory recovery and confirmation lanes.
    for tools in [['inspect_app_ui_model_source', 'repair_app_ui_model'], ['ask_user_question']]:
        assert {t.name for t in middleware._request(request(tools=tools)).tools} == set(tools)


def test_discovery_explains_deferred_tool_with_current_host_inspection_requirement():
    from agent_ui_creator.domain_agent.tool_discovery import create_enable_creator_tools
    from agent_ui_creator.domain_state import DomainObservationContext
    observations = DomainObservationContext()
    revision = 0
    discover = create_enable_creator_tools(observations, lambda: revision)
    # Navigation schema and instructions stay identical; only Host result data changes.
    assert discover.description == enable_creator_tools.description
    assert discover.args_schema.model_json_schema() == enable_creator_tools.args_schema.model_json_schema()
    deferred = json.loads(discover.invoke({'groups':['composition']}))
    assert deferred['deferredTools'] == ['mutate_app_ui_model']
    assert deferred['appUIModelObservation']['requiredInspection'] == {'tool':'inspect_app_ui_model','arguments':{}}
    observations.observe_app_ui_model(hash='a' * 64, revision=revision, source='inspect_app_ui_model')
    ready = json.loads(discover.invoke({'groups':['composition']}))
    assert ready['appUIModelObservation']['ready'] is True
    assert 'deferredTools' not in ready
    revision += 1
    assert json.loads(discover.invoke({'groups':['composition']}))['appUIModelObservation']['ready'] is False
    observations.recovery_pending = True
    assert json.loads(discover.invoke({'groups':['composition']}))['appUIModelObservation']['requiredInspection']['tool'] == 'inspect_app_ui_model_source'
    observations.recovery_requires_composition = True
    assert json.loads(discover.invoke({'groups':['composition']}))['appUIModelObservation']['requiredInspection'] == {'tool':'inspect_ui_project','arguments':{'view':'composition'}}
    assert json.loads(discover.invoke({'groups':['history']})) == {'ok':True,'enabledGroups':['history']}
