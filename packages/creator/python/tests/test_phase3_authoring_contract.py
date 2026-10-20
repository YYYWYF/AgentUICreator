"""Real Operator/Creator boundary regressions; no model or fabricated Host facts."""
import asyncio
import json
import pytest
from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.app_ui_model import AppUIModelMutationService, ProjectMutationCoordinator
from agent_ui_creator.app_ui_model.mutation_tool import create_app_ui_model_mutation_tool
from agent_ui_creator.domain_state import DomainObservationContext
from agent_ui_creator.operator.client import OperatorClient
from agent_ui_creator.minimal_agent.path_policy import MinimalAgentPathPolicy, PolicyFilesystemBackend
from phase3_support import prepare_host, clone_host, model, instances, MODEL_PATH

class ObservedOperator(OperatorClient):
    def __init__(self, root):
        super().__init__(project_root=root)
        self.mutations=[]
    async def request_app_ui_model_mutation(self,input):
        self.mutations.append(input)
        return await super().request_app_ui_model_mutation(input)

@pytest.fixture(scope='module')
def seed(tmp_path_factory):
    return prepare_host(tmp_path_factory.mktemp('phase3-seed')/'host')

@pytest.fixture
def harness(seed,tmp_path):
    root=clone_host(seed,tmp_path/'host')
    client=ObservedOperator(root)
    activity=CreatorActivityRecorder(root)
    activity.begin('phase3-contract')
    observations=DomainObservationContext()
    service=AppUIModelMutationService(project_root=root,operator=client,activity=activity,mutation_coordinator=ProjectMutationCoordinator())
    return root,client,activity,observations,create_app_ui_model_mutation_tool(service,observations)

async def observe(h):
    s=await h[1].inspect_ui_project(view='composition')
    h[3].observe_app_ui_model(hash=s['appUIModel']['hash'],revision=h[2].revision,source='inspect_ui_project')
    return s

async def mutate(h,ops):
    return json.loads(await h[-1].ainvoke({'operations':ops}))

def test_instance_slot_move_and_visibility_preserve_other_targets(harness):
    root,client,activity,_,_=harness
    before=model(root)
    async def run():
        s=await observe(harness)
        surface=next(i for i in s['pluginInstances'] if i['pluginId']=='conversation-surface')
        result=await mutate(harness,[
            {'type':'move_plugin','instanceId':'agent-identity-main','target':surface['target']},
            {'type':'set_plugin_enabled','instanceId':'dictation-action-main','enabled':False}])
        assert result['ok'],result
        after=await client.inspect_ui_project(view='composition')
        assert next(i for i in after['pluginInstances'] if i['id']=='agent-identity-main')['target']==surface['target']
    asyncio.run(run())
    b={i['id']:i for i in instances(before)}
    a={i['id']:i for i in instances(model(root))}
    assert a.keys()==b.keys()
    assert a['dictation-action-main']['enabled'] is False
    excluded={'dictation-action-main','composer-main','agent-conversation-surface-main'}
    assert {k:v for k,v in a.items() if k not in excluded}=={k:v for k,v in b.items() if k not in excluded}
    assert [f['path'] for f in activity.snapshot()['files']]==[MODEL_PATH]
    assert len(client.mutations)==1

@pytest.mark.parametrize('case,operation',[
 ('runtime_slot',{'type':'move_plugin','instanceId':'agent-identity-main','target':{'type':'layout_slot','slotRef':'layout:root.content'}}),
 ('plugin_id_as_instance',{'type':'set_plugin_enabled','instanceId':'composer','enabled':False}),
 ('invalid_size',{'type':'update_layout_node_props','nodeRef':'l4','set':{'width':'1fr'}}),
 ('missing_relative_target',{'type':'move_plugin_to','instanceId':'copy-action-main','placement':{'type':'relative','anchorInstanceId':'missing-main','relation':'after'}}),
 ('undeclared_slot',{'type':'move_plugin','instanceId':'copy-action-main','target':{'type':'plugin_slot','parentInstanceId':'response-footer-main','slot':'notDeclared'}}),
])
def test_invalid_targets_have_precise_errors_and_no_disk_changes(harness,case,operation):
    root,_,activity,_,_=harness
    before=(root/MODEL_PATH).read_bytes()
    async def run():
        await observe(harness)
        result=await mutate(harness,[operation])
        assert not result['ok'],result
        print(case,json.dumps(result['error'],ensure_ascii=False))
        expected={'runtime_slot':'OPERATOR_PROTOCOL_INCOMPATIBLE','plugin_id_as_instance':'PLUGIN_NOT_FOUND','invalid_size':'INVALID_REQUEST','missing_relative_target':'AUTHORING_MOVE_UNSUPPORTED','undeclared_slot':'APP_UI_MODEL_COMPOSITION_INVALID'}
        assert result['error']['code']==expected[case]
        if case=='undeclared_slot':
            issue=next(item for item in result['error']['details']['issues'] if item['code']=='plugin-slot-not-declared')
            assert issue['slot']=='notDeclared'
            assert issue['instanceId']=='response-footer-main'
            assert issue['pluginId']=='response-footer'
            assert issue['path'].endswith('.slots.notDeclared')
        if case=='invalid_size':
            assert 'input.operations[0].set.width' in result['error']['message']
        if case=='runtime_slot':
            assert result['error']['details']['field']=='input.operations.0'
        if case=='missing_relative_target':
            assert result['error']['details']['reason']=='anchor-not-found'
        assert result['error']['stateChanged'] is False
        assert result['error']['recovery']
    asyncio.run(run())
    assert (root/MODEL_PATH).read_bytes()==before
    assert activity.revision==0
    assert activity.snapshot()['files']==[]

def test_stale_hash_requires_fresh_observation_before_retry(harness):
    root,client,activity,_,_=harness
    async def run():
        await observe(harness)
        external=model(root)
        next(i for i in instances(external) if i['id']=='dictation-action-main')['enabled']=False
        (root/MODEL_PATH).write_text(json.dumps(external)+'\n',encoding='utf-8')
        ops=[{'type':'set_plugin_enabled','instanceId':'copy-action-main','enabled':False}]
        stale=await mutate(harness,ops)
        assert stale['error']['code']=='APP_UI_MODEL_HASH_CONFLICT',stale
        assert stale['error']['observationStillValid'] is False
        count=len(client.mutations)
        rejected=await mutate(harness,ops)
        assert rejected['error']['code']=='APP_UI_MODEL_OBSERVATION_REQUIRED'
        assert len(client.mutations)==count
        await observe(harness)
        assert (await mutate(harness,ops))['ok']
    asyncio.run(run())
    selected={i['id']:i for i in instances(model(root))}
    assert not selected['dictation-action-main']['enabled']
    assert not selected['copy-action-main']['enabled']
    assert activity.revision==1

def test_successful_transaction_is_not_dispatched_twice(harness):
    _,client,activity,_,_=harness
    async def run():
        await observe(harness)
        ops=[{'type':'set_plugin_enabled','instanceId':'dictation-action-main','enabled':False}]
        assert (await mutate(harness,ops))['ok']
        revision=activity.revision
        repeated=await mutate(harness,ops)
        assert repeated['ok'],repeated
        assert activity.revision==revision
        assert repeated['result']['changed'] is False
        assert repeated['result']['idempotentReplayOf']
        assert len(activity.snapshot()['files'])==1
    asyncio.run(run())
    assert len(client.mutations)==1

def test_idempotent_replay_dispatches_again_when_project_state_changed(harness):
    root,client,activity,_,_=harness
    async def run():
        await observe(harness)
        ops=[{'type':'set_plugin_enabled','instanceId':'dictation-action-main','enabled':False}]
        assert (await mutate(harness,ops))['ok']
        changed=model(root)
        next(i for i in instances(changed) if i['id']=='dictation-action-main')['enabled']=True
        (root/MODEL_PATH).write_text(json.dumps(changed)+'\n',encoding='utf-8')
        await observe(harness)
        repeated=await mutate(harness,ops)
        assert repeated['ok'],repeated
        assert repeated['result']['changed'] is True
    asyncio.run(run())
    assert len(client.mutations)==2
    assert not next(i for i in instances(model(root)) if i['id']=='dictation-action-main')['enabled']
    assert activity.revision==2

def test_npm_public_props_edit_stays_application_owned_without_takeover(harness):
    root,client,activity,_,_=harness
    facts=asyncio.run(client.inspect_ui_plugin('composer'))
    app=facts['application']
    assert app['implementationOwnership']=='npm'
    assert 'placeholder' in [p['name'] for p in app['publicApi']['props']]
    backend=PolicyFilesystemBackend(root,MinimalAgentPathPolicy.development(),activity=activity)
    path='/'+app['entryPath']
    assert backend.read(path).error is None
    edited=backend.edit(path,'<Composer {...props} />','<Composer {...props} rootProps={{...props.rootProps, className: "phase3-contract"}} />')
    assert edited.error is None,edited
    after=asyncio.run(client.inspect_ui_plugin('composer'))
    assert after['application']['implementationOwnership']=='npm'
    assert after['application']['implementationImport']==app['implementationImport']
    assert not (root/'src/agent-ui/plugins/composer/source').exists()
    assert [f['path'] for f in activity.snapshot()['files']]==[app['entryPath']]
    assert app['usageGuide']['entryPath']==app['entryPath']
    from agent_ui_creator.validation import CreatorValidationCommandRunner
    checked=asyncio.run(CreatorValidationCommandRunner(root).execute_known_command('pnpm typecheck'))
    assert checked.exit_code==0,checked.output

@pytest.mark.parametrize('method',['write','edit'])
def test_generic_file_tools_cannot_write_app_ui_json(harness,method):
    root,_,activity,_,_=harness
    backend=PolicyFilesystemBackend(root,MinimalAgentPathPolicy.development(),activity=activity)
    before=(root/MODEL_PATH).read_bytes()
    if method=='write': result=backend.write('/'+MODEL_PATH,'{}')
    else:
        backend.read('/'+MODEL_PATH)
        result=backend.edit('/'+MODEL_PATH,'"platform"','"assistant"')
    assert result.error and 'TOOL_PERMISSION_DENIED' in result.error
    assert (root/MODEL_PATH).read_bytes()==before
    assert activity.revision==0

@pytest.mark.parametrize('decision',['approve','decline'])
def test_real_takeover_interrupt_preserves_application_and_model(harness,decision):
    from typing import TypedDict
    from langgraph.graph import StateGraph,START,END
    from langgraph.checkpoint.memory import InMemorySaver
    from langgraph.types import Command
    from agent_ui_creator.domain_tools import create_operator_tools
    root,client,_,_,_=harness
    app=root/'src/agent-ui/plugins/composer/index.tsx'
    # Fixture customization is owned by this isolated test consumer.
    app.write_text(app.read_text().replace('<Composer {...props} />','<Composer {...props} rootProps={{...props.rootProps, className: "keep-me"}} />'))
    before=(root/MODEL_PATH).read_bytes()
    source=root/'src/agent-ui/plugins/composer/source'
    tool=next(t for t in create_operator_tools(client) if t.name=='takeover_plugin_source')
    assert 'approved' not in tool.args and 'planHash' not in tool.args
    class State(TypedDict):
        result:str
    async def node(state):
        return {'result':await tool.ainvoke({'pluginId':'composer'})}
    graph=StateGraph(State)
    graph.add_node('takeover',node)
    graph.add_edge(START,'takeover')
    graph.add_edge('takeover',END)
    graph=graph.compile(checkpointer=InMemorySaver())
    async def run():
        config={'configurable':{'thread_id':'isolated-takeover'}}
        paused=await graph.ainvoke({},config)
        assert paused['__interrupt__']
        assert not source.exists()
        assert (await client.inspect_ui_plugin('composer'))['application']['implementationOwnership']=='npm'
        step=paused['__interrupt__'][0].value['steps'][0]['id']
        assert step.startswith('plugin-source-')
        # Explicit fixture decision through the real trusted resume channel.
        result=await graph.ainvoke(Command(resume={'answers':{step:[decision]}}),config)
        payload=json.loads(result['result'])
        assert payload['ok'],payload
        after=await client.inspect_ui_plugin('composer')
        assert after['application']['implementationOwnership']==('project' if decision=='approve' else 'npm')
    asyncio.run(run())
    assert (root/MODEL_PATH).read_bytes()==before
    assert 'className: "keep-me"' in app.read_text()
    assert source.exists() is (decision=='approve')


def test_static_pass_does_not_claim_runtime_or_browser_verification(harness):
    from agent_ui_creator.validation import CreatorValidationService
    from agent_ui_creator.runtime_diagnostics import RuntimeDiagnosticStore,RuntimeDiagnosticInspectionService
    from agent_ui_creator.repair import CreatorRepairState
    from agent_ui_creator.domain_agent.completion_gate import CreatorDevelopmentCompletionGate
    root,client,activity,observations,_=harness
    validation=CreatorValidationService(project_root=root,activity=activity)
    async def run():
        await validation.ensure_baseline()
        await observe(harness)
        assert (await mutate(harness,[{'type':'set_plugin_enabled','instanceId':'dictation-action-main','enabled':False}]))['ok']
        result=await validation.validate()
        assert result.status=='passed',result.to_dict()
    asyncio.run(run())
    runtime=RuntimeDiagnosticInspectionService(store=RuntimeDiagnosticStore(),thread_id='phase3',operator=client,observations=observations,activity=activity)
    gate=CreatorDevelopmentCompletionGate(activity=activity,validation=validation,runtime=runtime,repair_state=CreatorRepairState(),verification_mode='static_only')
    decision=gate.review('已完成修改。')
    assert decision.accepted
    receipt=activity.snapshot()['verification']
    assert receipt['verificationMode']=='static_only'
    assert receipt['runtimeStatus']=='not-run'
    assert '浏览器验证通过' not in decision.text
    assert not any(c.get('id')=='runtime-verification' and c.get('status')=='passed' for c in receipt['checks'])
    runtime_gate=CreatorDevelopmentCompletionGate(activity=activity,validation=validation,runtime=runtime,repair_state=CreatorRepairState(),verification_mode='static_and_runtime')
    denied=runtime_gate.review('已完成修改。')
    assert not denied.accepted or denied.completion!='success'
    assert activity.snapshot()['verification']['runtimeStatus']!='passed'

@pytest.mark.parametrize('index,expected,changed',[
    (1,['copy-action-main','reload-action-main','feedback-actions-main','export-markdown-action-main'],False),
    (2,['reload-action-main','copy-action-main','feedback-actions-main','export-markdown-action-main'],True),
])
def test_child_slot_reorder_uses_pre_detach_insertion_index(harness,index,expected,changed):
    root,_,_,_,_=harness
    async def run():
        snapshot=await observe(harness)
        copy=next(i for i in snapshot['pluginInstances'] if i['id']=='copy-action-main')
        assert copy['target']=={'type':'plugin_slot','parentInstanceId':'response-footer-main','slot':'actions'}
        result=await mutate(harness,[{'type':'move_plugin','instanceId':copy['id'],'target':copy['target'],'index':index}])
        assert result['ok'],result
        assert result['result']['changed'] is changed
    asyncio.run(run())
    footer=next(i for i in instances(model(root)) if i['id']=='response-footer-main')
    assert [i['id'] for i in footer['slots']['actions']]==expected

def test_later_real_change_invalidates_previous_noop_completion(tmp_path):
    root=tmp_path/'consumer'
    root.mkdir()
    file=root/'plugin.tsx'
    file.write_text('before',encoding='utf-8')
    activity=CreatorActivityRecorder(root)
    activity.begin('noop-then-change')
    activity.record_semantic_noop(source='mutate_app_ui_model',reason='already-satisfied')
    activity.capture_before('plugin.tsx')
    file.write_text('after',encoding='utf-8')
    activity.touch('plugin.tsx')
    assert activity.snapshot()['files']
    assert not activity.semantic_noop_satisfied
    activity.record_semantic_noop(source='mutate_app_ui_model',reason='already-satisfied')
    assert not activity.semantic_noop_satisfied

def test_real_operator_mutation_clears_prior_noop_completion(harness):
    root,client,activity,_,_=harness
    async def run():
        await observe(harness)
        already_enabled=await mutate(harness,[{'type':'set_plugin_enabled','instanceId':'dictation-action-main','enabled':True}])
        assert already_enabled['ok'],already_enabled
        assert already_enabled['result']['changed'] is False
        assert activity.semantic_noop_satisfied
        changed=await mutate(harness,[{'type':'set_plugin_enabled','instanceId':'copy-action-main','enabled':False}])
        assert changed['ok'],changed
        assert changed['result']['changed'] is True
        assert not activity.semantic_noop_satisfied
    asyncio.run(run())
    assert activity.revision==1
    assert len(client.mutations)==2
    selected={i['id']:i for i in instances(model(root))}
    assert selected['dictation-action-main']['enabled'] is True
    assert selected['copy-action-main']['enabled'] is False

def test_invalid_layout_dimension_repair_receives_leaf_type_feedback():
    from langchain.agents.middleware import ModelResponse
    from langchain_core.messages import AIMessage
    from agent_ui_creator.app_ui_model.mutation_tool import APP_UI_MODEL_MUTATION_TOOL_SCHEMA
    from agent_ui_creator.model_protocol import ToolProtocolGuard,ToolProtocolMetrics
    from agent_ui_creator.model_protocol.tool_protocol_guard import _repair_validation_hint
    metrics=ToolProtocolMetrics(modelCalls=1)
    tool={'type':'function','function':{'name':'mutate_app_ui_model','parameters':APP_UI_MODEL_MUTATION_TOOL_SCHEMA}}
    call={'name':'mutate_app_ui_model','id':'invalid-width','args':{'operations':[{'type':'update_layout_node_props','nodeRef':'l4','set':{'maxWidth':'960px'}}]}}
    decision=ToolProtocolGuard(metrics).inspect(ModelResponse(result=[AIMessage(content='',tool_calls=[call])]),[tool])
    assert decision.status=='repair'
    assert metrics.protocolDiagnostics[-1]['branchErrors']==[{'path':['set','maxWidth'],'type':'type'}]
    hint=_repair_validation_hint(metrics,model_call_sequence=1,expected_tool_name='mutate_app_ui_model')
    assert hint and 'maxWidth' in hint and any(word in hint.lower() for word in ['number','numeric','integer'])
