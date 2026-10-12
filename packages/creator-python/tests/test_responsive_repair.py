import json
import pytest
from agent_ui_creator.responsive_repair import build_repair_plan, responsive_risks, ResponsiveRiskTracker, STRATEGIES


def test_plan_preserves_sources_and_requires_confirmation():
    sources = {'plugins/notes/styles.css': '.notes { width:100%; padding:12px; }',
               'plugins/notes/index.tsx': '<div className="notes" />'}
    plan = build_repair_plan(plugin_id='notes', slot={'width':279}, risks=[], sources=sources,
        edits=[{'file':'plugins/notes/styles.css', 'before':'width:100%;',
                'after':'width:100%; box-sizing:border-box; max-width:100%;', 'reason':'confirmed padding overflow'}])
    assert sources['plugins/notes/styles.css'] == '.notes { width:100%; padding:12px; }'
    assert '+.notes' in plan['diffs']['plugins/notes/styles.css']
    assert plan['writeAuthorized'] is False
    assert plan['status'] == 'awaiting-user-confirmation'
    assert plan['browserAcceptance'] == 'NOT_RUN'
    assert len(plan['sourceHashes']['plugins/notes/styles.css']) == 64


@pytest.mark.parametrize('file,before,reason', [('host.css','width:100%;','risk'),
    ('plugins/notes/index.tsx','<div','inline layout'), ('plugins/notes/styles.css','absent','risk'),
    ('plugins/notes/styles.css','width:100%;','')])
def test_plan_rejects_uninspected_non_css_stale_and_unreasoned_edits(file,before,reason):
    with pytest.raises(ValueError):
        build_repair_plan(plugin_id='notes',slot={'width':279},risks=[],
            sources={'plugins/notes/styles.css':'.notes { width:100%; }', 'plugins/notes/index.tsx':'<div />'},
            edits=[{'file':file,'before':before,'after':'new','reason':reason}])


def test_risk_parser_and_strategies_do_not_promote_warnings():
    risks = responsive_risks([{'pluginId':'notes','code':'PLUGIN_RESPONSIVE_FULL_WIDTH_PADDING','selector':'.notes'},
        {'pluginId':'other','code':'PLUGIN_RESPONSIVE_FULL_WIDTH_PADDING'},
        {'pluginId':'notes','code':'PLUGIN_STYLE_GLOBAL_SELECTOR_NOT_ALLOWED'}], 'notes')
    assert len(risks) == 1
    plan = build_repair_plan(plugin_id='notes',slot={'width':279},risks=risks,sources={},edits=[])
    assert plan['status'] == 'analysis-required'
    assert plan['strategyCandidates'][0]['requiresCascadeAndComponentReview']
    assert STRATEGIES['PLUGIN_RESPONSIVE_FULL_WIDTH_PADDING']['box-sizing'] == 'border-box'
    assert STRATEGIES['PLUGIN_RESPONSIVE_MIN_WIDTH_AUTO'] == {'min-width':'0'}
    assert STRATEGIES['PLUGIN_RESPONSIVE_FIXED_ROOT_WIDTH'] == {'max-width':'100%'}


def test_tracker_baseline_resolution_and_missing_evidence():
    tracker = ResponsiveRiskTracker()
    assert tracker.to_dict()['responsiveRiskCount'] is None
    risk={'code':'PLUGIN_RESPONSIVE_FULL_WIDTH_PADDING','pluginId':'notes','file':'styles.css','selector':'.notes','line':1}
    tracker.observe('pnpm verify:ui\n'+json.dumps({'status':'passed','warnings':[risk]}))
    assert tracker.to_dict()['responsiveRiskCount'] == 1
    tracker.observe(json.dumps({'status':'passed','warnings':[{**risk,'line':50}]}))
    assert tracker.to_dict()['responsiveRiskResolved'] == 0
    tracker.observe(json.dumps({'status':'passed','warnings':[]}))
    assert tracker.to_dict()['responsiveRiskResolved'] == 1
    tracker.observe('{}')
    assert tracker.to_dict()['responsiveRiskResolved'] is None
    tracker.observe(json.dumps({'status':'passed','warnings':[]}),truncated=True)
    assert tracker.to_dict()['responsiveRiskCount'] is None


@pytest.mark.asyncio
async def test_creator_tool_uses_host_warnings_and_actual_plugin_source(tmp_path):
    from agent_ui_creator.domain_tools import create_project_control_tools
    directory=tmp_path/'plugins'/'notes'
    directory.mkdir(parents=True)
    css=directory/'styles.css'; css.write_text('.notes { width:100%; padding:12px; }')
    (directory/'index.tsx').write_text('<div className="notes" />')
    class Client:
        project_root=tmp_path
        async def inspect_ui_plugin(self, plugin_id):
            return {'asset':{'manifestPath':'plugins/notes/manifest.json','ownership':'project'},
                    'instances':[{'id':'notes-main'}], 'files':[{'path':'plugins/notes/styles.css','kind':'file'},
                     {'path':'plugins/notes/index.tsx','kind':'file'}], 'filesTruncated':False}
        async def verify_ui_project(self):
            return {'status':'passed','warnings':[{'code':'PLUGIN_RESPONSIVE_FULL_WIDTH_PADDING','pluginId':'notes',
                     'file':'plugins/notes/styles.css','selector':'.notes','line':1}]}
    tool=next(t for t in create_project_control_tools(Client()) if t.name=='prepare_plugin_responsive_repair')
    raw=await tool.ainvoke({'pluginId':'notes','slotRef':'sidebar','slotWidth':279,
                           'edits':[{'file':'plugins/notes/styles.css','before':'width:100%;',
                                     'after':'width:100%; box-sizing:border-box;','reason':'confirmed overflow'}]})
    result=json.loads(raw)['result']
    assert result['responsiveRiskCount']==1
    assert result['sources']['plugins/notes/index.tsx']=='<div className="notes" />'
    assert result['writeAuthorized'] is False
    assert css.read_text()=='.notes { width:100%; padding:12px; }'


@pytest.mark.asyncio
async def test_validate_tool_reports_static_resolution_for_current_run(tmp_path):
    from agent_ui_creator.activity import CreatorActivityRecorder
    from agent_ui_creator.validation import CreatorValidationService, CommandExecutionResult, create_validation_tool
    activity=CreatorActivityRecorder(tmp_path);activity.begin('responsive')
    risk={'code':'PLUGIN_RESPONSIVE_FULL_WIDTH_PADDING','pluginId':'notes','file':'plugins/notes/styles.css','selector':'.notes'}
    class Runner:
        repaired=False
        async def execute_known_command(self,command):
            output=json.dumps({'status':'passed','warnings':[] if self.repaired else [risk]}) if command=='pnpm verify:ui' else ''
            return CommandExecutionResult(output,0,False)
    runner=Runner();service=CreatorValidationService(project_root=tmp_path,activity=activity,runner=runner)
    tool=create_validation_tool(service)
    result=json.loads(await tool.ainvoke({}))['result']
    assert result['responsiveRiskCount']==1 and result['responsiveRiskResolved']==0
    runner.repaired=True;activity.touch('plugins/notes/styles.css')
    result=json.loads(await tool.ainvoke({}))['result']
    assert result['responsiveRiskCount']==0 and result['responsiveRiskResolved']==1
    assert result['responsiveEvidenceKind']=='static-hints-only'
    result=json.loads(await tool.ainvoke({}))['result']
    assert result['responsiveRiskResolved']==1
    activity.begin('next-run')
    result=json.loads(await tool.ainvoke({}))['result']
    assert result['responsiveRiskResolved']==0


def test_tracker_counts_repeated_selector_risks_separately():
    tracker=ResponsiveRiskTracker()
    risk={'code':'PLUGIN_RESPONSIVE_MIN_WIDTH_AUTO','pluginId':'notes','selector':'.notes'}
    tracker.observe(json.dumps({'status':'passed','warnings':[risk,risk]}))
    assert tracker.to_dict()['responsiveRiskCount']==2
    tracker.observe(json.dumps({'status':'passed','warnings':[risk]}))
    assert tracker.to_dict()['responsiveRiskResolved']==1


@pytest.mark.asyncio
async def test_new_plugin_creation_preserves_responsive_css_contract(tmp_path):
    from pathlib import Path
    from agent_ui_creator.activity import CreatorActivityRecorder
    from agent_ui_creator.app_ui_model import ProjectMutationCoordinator
    from agent_ui_creator.minimal_agent.path_policy import MinimalAgentPathPolicy
    from agent_ui_creator.source_tools import UIPluginCreationService, UIPluginSourceFile, UISourceCreationService
    from agent_ui_creator.source_tools.create_plugin_tool import create_ui_plugin_tool
    metadata=tmp_path/'.agent-ui';metadata.mkdir()
    (metadata/'project.json').write_text(json.dumps({'mode':'embedded','sourceRoot':'src/agent-ui'}))
    activity=CreatorActivityRecorder(tmp_path);activity.begin('new-responsive-plugin')
    source=UISourceCreationService(project_root=tmp_path,activity=activity,
        mutation_coordinator=ProjectMutationCoordinator(),path_policy=MinimalAgentPathPolicy.internal_source())
    creation=UIPluginCreationService(project_root=tmp_path,source_creation=source,activity=activity,internal_trusted=True)
    css='.notes-root { box-sizing:border-box; width:100%; padding:12px; min-width:0; max-width:100%; }'
    files=[UIPluginSourceFile(relativePath=file,content=content) for file,content in {
        'manifest.json':'{"id":"notes"}', 'definition.ts':'export {};',
        'index.tsx':'import "./styles.css"; export {};', 'styles.css':css}.items()]
    result=await creation.create('notes',files)
    assert result.plugin_id=='notes'
    assert (tmp_path/'src/agent-ui/plugins/notes/styles.css').read_text()==css
    description=create_ui_plugin_tool(creation).description
    assert 'border-box' in description and '420px' in description
    skill=(Path(__file__).resolve().parents[3]/'packages/creator/skills/ui-plugin-development/SKILL.md').read_text()
    assert '279px' in skill and 'overflow-wrap: anywhere' in skill
