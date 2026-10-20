"""Native read-plan question -> narrowly scoped Host transaction, real Operator."""
import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
from agent_ui_creator.config import CreatorServerSettings
from agent_ui_creator.human_input.source_takeover import SourceTakeoverConfirmation
from agent_ui_creator.operator import OperatorClient, OperatorError
from agent_ui_creator.server import create_app
from test_request_router_server import RoutedModel
from test_takeover_planning_facts import snapshot
from phase3_support import prepare_host, clone_host, ROOT, SKILLS

@pytest.fixture(scope='module')
def seed(tmp_path_factory):
    return prepare_host(tmp_path_factory.mktemp('confirmation-seed')/'host')

@pytest.mark.parametrize('decision', ['approve','decline','stale','forged','rewritten'])
def test_real_router_pause_and_native_resume(seed,tmp_path,monkeypatch,decision):
    root=clone_host(seed,tmp_path/'host')
    plan=asyncio.run(OperatorClient(project_root=root).plan_plugin_source_takeover('composer'))
    binding=SourceTakeoverConfirmation.from_plan({**plan, 'planHash':plan['planHash'] if decision!='forged' else 'f'*64})
    request=binding.request().model_dump(mode='json',exclude_none=True)
    if decision=='rewritten':
        request['steps'][0]['description']='Model changed the wording.'
    model=RoutedModel(responses=[AIMessage(content='READ_ONLY_EXPLICIT INSPECT'),
        AIMessage(content='',tool_calls=[{'name':'enable_creator_tools','id':'enable','args':{'groups':['plugin_authoring']}}]),
        AIMessage(content='',tool_calls=[{'name':'inspect_ui_plugin_source_references','id':'facts','args':{'pluginId':'composer'}}]),
        AIMessage(content='',tool_calls=[{'name':'ask_user_question','id':'question','args':request}]),
        AIMessage(content='只读问题已回答。')])
    object.__setattr__(model,'offered',set())
    monkeypatch.setenv('CREATOR_PYTHON_AGENT_MODE','domain-write')
    monkeypatch.setenv('CREATOR_MODEL_BASE_URL','http://127.0.0.1:9/v1')
    monkeypatch.setenv('CREATOR_MODEL_API_KEY','test-only')
    monkeypatch.setattr('agent_ui_creator.model_factory.create_creator_chat_model',lambda *_a,**_k:model)
    settings=CreatorServerSettings(project_root=root,skills_root=SKILLS,config_root=ROOT,auth_token='x'*32,verification_mode='static_only')
    app=create_app(settings)
    before=snapshot(root)
    with TestClient(app,headers={'Authorization':'Bearer '+settings.auth_token}) as client:
        def events(run, command=None, thread='t'):
            response=client.post('/creator',json={'threadId':thread,'runId':run,'messages':[{'role':'user','content':'先给出 Composer 源码接管计划，等待确认，不要写入。'}],**({'forwardedProps':{'command':command}} if command else {})})
            return [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]
        initial=events('plan')
        assert not [e for e in initial if e['type']=='RUN_ERROR'],initial
        question=next(e['value'] for e in initial if e.get('name')=='on_interrupt')
        assert snapshot(root)==before
        if decision!='forged':
            assert plan['planHash'] in question['metadata']['steps'][0]['description']
            assert plan['package']['version'] in question['metadata']['steps'][0]['description']
        if decision=='rewritten':
            assert question['metadata']['steps'][0]['description'] != 'Model changed the wording.'
        pending=app.state.pending_creator_questions['t']
        assert pending.permission=='inspect_read_only'
        assert (pending.source_takeover_confirmation is None)==(decision=='forged')
        answer={'interruptId':question['id'],'answers':{request['steps'][0]['id']:['decline' if decision=='decline' else 'approve']}}
        assert any(e.get('code')=='CREATOR_INTERRUPT_NOT_FOUND' for e in events('wrong-thread',{'resume':answer},'wrong'))
        assert any(e.get('code')=='CREATOR_INTERRUPT_INVALID_ANSWER' for e in events('wrong-id',{'resume':{**answer,'interruptId':'fake'}}))
        assert snapshot(root)==before
        if decision=='stale':
            target=root/'src/agent-ui/plugins/composer/index.tsx'
            target.write_text(target.read_text()+'\n// externally changed\n')
            before=snapshot(root)
        resumed=events('answer',{'resume':answer})
        if decision=='stale':
            assert any(e.get('code')=='PLUGIN_SOURCE_PLAN_STALE' for e in resumed),resumed
        else:
            assert not [e for e in resumed if e['type']=='RUN_ERROR'],resumed
        if decision in {'approve','rewritten'}:
            assert (root/'src/agent-ui/plugins/composer/source').is_dir()
            assert not (root/'src/agent-ui/plugins/copy-action/source').exists()
            result=next(e['result'] for e in resumed if e.get('result'))
            assert result['phase']=='host-source-takeover'
            assert result['executionPolicy']=='confirmed-plugin-transaction'
            assert result['receipt']['files']
        else:
            assert snapshot(root)==before
        assert any(e.get('code')=='CREATOR_INTERRUPT_NOT_FOUND' for e in events('repeat',{'resume':answer}))

@pytest.mark.parametrize('answers',[{}, {'answers':{'plugin-source-'+'a'*64:['approve','decline']}}, {'answers':{'plugin-source-'+'b'*64:['approve']}}])
def test_invalid_answers_never_call_operator(answers):
    client=SimpleNamespace(plan_plugin_source_takeover=AsyncMock(),takeover_plugin_source=AsyncMock())
    with pytest.raises(ValueError):
        asyncio.run(SourceTakeoverConfirmation('composer','a'*64).execute(client,answers))
    client.plan_plugin_source_takeover.assert_not_called()
    client.takeover_plugin_source.assert_not_called()
