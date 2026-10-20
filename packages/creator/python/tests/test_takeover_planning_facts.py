"""Read-only planning uses the same real Operator plan as confirmed takeover."""
import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from langchain_core.messages import AIMessage
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from agent_ui_creator.domain_tools import create_operator_tools
from agent_ui_creator.domain_agent import create_domain_read_creator_agent
from agent_ui_creator.domain_agent.tool_policy import filter_domain_read_tools
from agent_ui_creator.domain_state import DomainObservationContext
from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.operator.client import OperatorClient
from agent_ui_creator.operator import OperatorError
from agent_ui_creator.model_protocol.errors import ToolPermissionDeniedError
from phase3_support import prepare_host, clone_host


def selected(tools,name):
    return next(t for t in tools if t.name==name)


def snapshot(root):
    return {p.relative_to(root).as_posix():p.read_bytes() for p in root.rglob('*')
        if p.is_file() and not any(s in {'node_modules','.agent-ui','dist'} for s in p.relative_to(root).parts)}


@pytest.fixture(scope='module')
def seed(tmp_path_factory):
    return prepare_host(tmp_path_factory.mktemp('takeover-facts-seed')/'host')


@pytest.mark.parametrize('plugin_id',['composer','copy-action'])
def test_real_plan_preserves_application_despite_source_item_install_conflict(seed,tmp_path,plugin_id):
    root=clone_host(seed,tmp_path/'host');client=OperatorClient(project_root=root)
    activity=CreatorActivityRecorder(root);activity.begin('read-only-plan')
    observations=DomainObservationContext()
    tools=filter_domain_read_tools(create_operator_tools(client,activity=activity,observations=observations),inspect_read_only=True)
    assert 'takeover_plugin_source' not in {t.name for t in tools}
    before=snapshot(root)
    async def run():
        inventory=json.loads(await selected(tools,'inspect_agent_ui_sources').ainvoke({}))['result']
        item=next(i for i in inventory['items'] if i['id']=='plugin/'+plugin_id)
        assert item['status']=='blocked'
        assert 'AGENT_UI_SOURCE_PATH_CONFLICT' in item['issueCodes']
        assert inventory['sourceInstallNavigation']['pathConflictAuthorizesApplicationDeletion'] is False
        value=json.loads(await selected(tools,'inspect_ui_plugin_source_references').ainvoke({'pluginId':plugin_id}))
        assert value['ok'],value
        facts=value['result']['sourceTakeover']
        assert facts['status']=='planned'
        assert facts['plan']==await client.plan_plugin_source_takeover(plugin_id)
        assert all(p.startswith('plugins/'+plugin_id+'/source/') for p in facts['plan']['files'])
        assert facts['applicationLayer']['deleteBeforeTakeover'] is False
        assert facts['applicationLayer']['preservePropsCompositionAndIdentity'] is True
        assert set(facts['applicationLayer']['operatorManagedImportChanges'])=={'index.tsx','definition.ts'}
        assert facts['sourceItemInstallation']['requiredBeforeTakeover'] is False
        assert facts['execution']=={'tool':'takeover_plugin_source','permission':'domain_write','freshPlanRequired':True,
            'nativeUserConfirmationRequired':True,'inspectionGrantsApproval':False}
        inspected=json.loads(await selected(tools,'inspect_ui_plugin').ainvoke({'pluginId':plugin_id}))
        assert inspected['result']['application']['sourceTakeoverPlanning']['arguments']=={'pluginId':plugin_id}
    asyncio.run(run())
    assert snapshot(root)==before
    assert observations.current_hash(current_revision=activity.revision) is None
    assert activity.revision==0 and not activity.snapshot()['files']


def test_real_plan_refreshes_after_application_changes_without_writing(seed,tmp_path):
    root=clone_host(seed,tmp_path/'host');client=OperatorClient(project_root=root)
    tool=selected(create_operator_tools(client),'inspect_ui_plugin_source_references')
    async def plan():
        value=json.loads(await tool.ainvoke({'pluginId':'composer'}));assert value['ok'],value
        return value['result']['sourceTakeover']['plan']
    old=asyncio.run(plan())
    application=root/'src/agent-ui/plugins/composer/index.tsx'
    application.write_text(application.read_text()+'\n// project customization retained\n')
    before=snapshot(root);current=asyncio.run(plan())
    assert current['planHash']!=old['planHash'] and current['stateHash']!=old['stateHash']
    assert snapshot(root)==before
    assert not (application.parent/'source').exists()


@pytest.mark.parametrize('plan',[{}, {'pluginId':'other','planHash':'a'*64}, {'pluginId':'composer','planHash':'bad'}])
def test_malformed_plan_is_not_published(plan):
    client=SimpleNamespace(inspect_ui_plugin_source_references=AsyncMock(return_value={'pluginId':'composer','references':[]}),
        plan_plugin_source_takeover=AsyncMock(return_value=plan))
    value=json.loads(asyncio.run(selected(create_operator_tools(client),'inspect_ui_plugin_source_references').ainvoke({'pluginId':'composer'})))
    assert value['ok']
    facts=value['result']['sourceTakeover']
    assert facts['status']=='not_planned' and facts['error']['code']=='OPERATOR_PROTOCOL_INCOMPATIBLE'
    assert 'plan' not in facts


def test_plan_error_keeps_reference_facts_and_does_not_cache_failure():
    plan={'pluginId':'composer','planHash':'a'*64,'applicationChanges':[]}
    client=SimpleNamespace(inspect_ui_plugin_source_references=AsyncMock(return_value={'pluginId':'composer','references':[{'path':'local.tsx'}]}),
        plan_plugin_source_takeover=AsyncMock(side_effect=[OperatorError('PLUGIN_SOURCE_INTEGRITY','snapshot mismatch'),plan]))
    tool=selected(create_operator_tools(client),'inspect_ui_plugin_source_references')
    first=json.loads(asyncio.run(tool.ainvoke({'pluginId':'composer'})))
    assert first['result']['references']==[{'path':'local.tsx'}]
    assert first['result']['sourceTakeover']['error']['code']=='PLUGIN_SOURCE_INTEGRITY'
    second=json.loads(asyncio.run(tool.ainvoke({'pluginId':'composer'})))
    assert second['result']['sourceTakeover']['status']=='planned'
    assert client.plan_plugin_source_takeover.await_count==2


def test_actual_read_agent_cannot_execute_takeover_after_planning(seed,tmp_path):
    root=clone_host(seed,tmp_path/'host')
    class Model(FakeMessagesListChatModel):
        def bind_tools(self,tools,**_kwargs):
            assert 'takeover_plugin_source' not in {t.name for t in tools}
            return self
    model=Model(responses=[
        AIMessage(content='',tool_calls=[{'name':'enable_creator_tools','args':{'groups':['plugin_authoring']},'id':'enable'}]),
        AIMessage(content='',tool_calls=[{'name':'inspect_ui_plugin_source_references','args':{'pluginId':'composer'},'id':'plan'}]),
        AIMessage(content='',tool_calls=[{'name':'takeover_plugin_source','args':{'pluginId':'composer'},'id':'forbidden'}]),
    ])
    before=snapshot(root)
    agent=create_domain_read_creator_agent(model=model,workspace=root,permission_scope='inspect_read_only',operator=OperatorClient(project_root=root))
    with pytest.raises(ToolPermissionDeniedError):
        asyncio.run(agent.run('只查看 Composer 的正式接管计划，不修改'))
    assert snapshot(root)==before
