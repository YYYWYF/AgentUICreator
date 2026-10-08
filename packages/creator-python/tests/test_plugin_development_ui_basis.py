"""Host fact/freshness checks; fixtures do not assert AI selection correctness."""
from __future__ import annotations

import hashlib
import json

import pytest

from agent_ui_creator.plugin_development.authority import PluginDevelopmentAuthority, PluginDevelopmentError
from agent_ui_creator.plugin_development.prepare_tool import create_prepare_ui_plugin_development_tool


@pytest.fixture
def host(tmp_path):
    (tmp_path / '.agent-ui').mkdir()
    (tmp_path / '.agent-ui/project.json').write_text(json.dumps({
        'mode': 'platform', 'sourceRoot': 'src/agent-ui',
    }))
    (tmp_path / 'src').mkdir()
    (tmp_path / 'src/App.tsx').write_text('export const App = () => <main />;')
    (tmp_path / 'package.json').write_text('{"dependencies": {}}')
    state = PluginDevelopmentAuthority(tmp_path, thread_id='thread')
    state.begin_task(task_id='task', request_id='request',
                     user_message='请开发一个独立业务备注插件', intent='explicit')
    return state


def plan(state, *, refs=None, category='panel', work_kind='create-plugin', ui_scope='复用已检查的宿主 UI'):
    return state.prepare(
        work_kind=work_kind, target_plugin_id='business-notes',
        desired_outcome='业务备注', missing_capabilities=['备注交互'], reuse_evidence_refs=[],
        ui_scope=ui_scope, component_basis_refs=refs,
        delivery_contract={
            'capability': '业务备注', 'renderingCategory': category,
            'placement': 'business panel', 'lifecycle': 'memory', 'dependencies': [],
            'reusedComponents': [], 'verificationMethod': 'runtime',
        },
    )


@pytest.mark.parametrize('category', ['panel', 'semantic-slot'])
def test_visual_creation_requires_host_basis(host, category):
    with pytest.raises(PluginDevelopmentError, match='componentBasisRefs'):
        plan(host, category=category)
    assert host.active is None


@pytest.mark.parametrize('refs', [['package.json'], ['src/theme.css'], ['package.json', 'src/theme.css']])
def test_metadata_or_styles_alone_do_not_establish_ui_investigation(host, refs):
    (host.project_root / 'src/theme.css').write_text('.host { color: black; }')
    with pytest.raises(PluginDevelopmentError, match='使用入口'):
        plan(host, refs=refs)


@pytest.mark.parametrize('reference', [
    'src/missing.tsx', '../outside.tsx', '/src/../../outside.tsx',
    'src', 'src\\App.tsx', 'src/App.tsx\x00', ' src/App.tsx',
    '.env.local', '.git/config', 'node_modules/library/index.tsx', 'dist/App.tsx',
])
def test_invalid_missing_or_unreadable_basis_is_rejected(host, reference):
    if reference in {'.env.local', '.git/config', 'node_modules/library/index.tsx', 'dist/App.tsx'}:
        target = host.project_root / reference
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text('exists but forbidden')
    with pytest.raises(PluginDevelopmentError, match='componentBasisRefs'):
        plan(host, refs=['src/App.tsx', reference])
    assert host.active is None


def test_symlink_outside_project_or_into_denied_directory_is_rejected(host, tmp_path):
    outside = tmp_path.parent / (tmp_path.name + '-outside.tsx')
    outside.write_text('export const Outside = () => null;')
    alias = tmp_path / 'src/alias.tsx'
    alias.symlink_to(outside)
    with pytest.raises(PluginDevelopmentError, match='componentBasisRefs'):
        plan(host, refs=['src/alias.tsx'])
    alias.unlink()
    secret = tmp_path / '.env.local'
    secret.write_text('private')
    alias.symlink_to(secret)
    with pytest.raises(PluginDevelopmentError, match='componentBasisRefs'):
        plan(host, refs=['src/alias.tsx'])


def test_actual_host_basis_is_hashed_and_allows_first_write(host):
    result = plan(host, refs=['/src/App.tsx', 'package.json'])
    assert result['status'] == 'authorized'
    assert host.active.component_basis_hashes == tuple(
        (relative, hashlib.sha256((host.project_root / relative).read_bytes()).hexdigest())
        for relative in ['src/App.tsx', 'package.json']
    )
    host.mark_skill_loaded()
    host.require_create('business-notes')


@pytest.mark.parametrize('change', ['edit', 'delete', 'dependency-edit', 'retarget'])
def test_changed_basis_blocks_first_write_and_requires_refresh(host, change):
    alias = host.project_root / 'src/alias.tsx'
    alias.symlink_to(host.project_root / 'src/App.tsx')
    plan(host, refs=['src/alias.tsx', 'package.json'])
    host.mark_skill_loaded()
    if change == 'edit':
        (host.project_root / 'src/App.tsx').write_text('changed')
    elif change == 'delete':
        (host.project_root / 'src/App.tsx').unlink()
    elif change == 'dependency-edit':
        (host.project_root / 'package.json').write_text('{"dependencies":{"antd":"^5"}}')
    else:
        alias.unlink()
        (host.project_root / 'src/other.tsx').write_text('export const App = () => <main />;')
        alias.symlink_to(host.project_root / 'src/other.tsx')
    with pytest.raises(PluginDevelopmentError, match='刷新开发方案'):
        host.require_create('business-notes')
    if change != 'delete':
        plan(host, refs=['src/alias.tsx', 'package.json'])
        host.require_create('business-notes')


def test_changed_basis_blocks_authorization_resume(host):
    host.intent = 'needs_decision'
    result = plan(host, refs=['src/App.tsx'])
    question = {'question': 'start?'}
    host.register_decision_question(result['proposalId'], question)
    host.bind_question(result['proposalId'], question_id='q', checkpoint_id='c', question=question)
    (host.project_root / 'src/App.tsx').write_text('changed')
    with pytest.raises(PluginDevelopmentError, match='刷新开发方案'):
        host.decide(result['proposalId'], question_id='q', checkpoint_id='c', choice='start')
    assert host.active.status == 'pending'


@pytest.mark.parametrize('source,scope', [
    ('import {Button, Input, Card, ConfigProvider, theme} from "antd"; export const App = () => <ConfigProvider theme={{algorithm: theme.darkAlgorithm}}><Card><Input/><Button/></Card></ConfigProvider>;', '复用 antd Button/Input/Card，使用 src/Provider.tsx 中的 ConfigProvider 和 theme.darkAlgorithm'),
    ('import {Button, Input, Card} from "./design-system"; export const App = () => <Card><Input/><Button/></Card>;', '页面使用自研组件；复用 ./design-system，不因安装 antd 而切换'),
    ('export const App = () => <main>No reusable controls</main>;', '检查页面和 package.json 后没有合适控件，使用现有 primitives 和 scoped tokens，不新增依赖'),
])
def test_host_accepts_evidenced_plans_without_selecting_library(host, source, scope):
    (host.project_root / 'src/App.tsx').write_text(source)
    (host.project_root / 'src/Provider.tsx').write_text('export const Provider = ({children}) => children;')
    (host.project_root / 'package.json').write_text('{"dependencies":{"antd":"^5"}}')
    result = plan(host, refs=['src/App.tsx', 'src/Provider.tsx', 'package.json'], ui_scope=scope)
    assert result['uiScope'] == scope
    assert result['deliveryContract']['dependencies'] == []
    host.mark_skill_loaded()
    host.require_create('business-notes')


def test_application_and_legacy_nonvisual_plans_do_not_gain_evidence_requirement(host):
    assert plan(host, category='application')['status'] == 'authorized'
    result = host.prepare(work_kind='create-plugin', target_plugin_id='headless-service',
                          desired_outcome='Service', missing_capabilities=['Service'], reuse_evidence_refs=[])
    assert result['status'] == 'authorized'


def test_existing_capability_extension_does_not_gain_evidence_requirement(host):
    (host.project_root / 'src/agent-ui/plugins/business-notes').mkdir(parents=True)
    assert plan(host, work_kind='extend-capability')['status'] == 'authorized'


def test_logical_managed_component_path_remains_supported(host):
    component = host.project_root / 'src/agent-ui/components/Control.tsx'
    component.parent.mkdir(parents=True)
    component.write_text('export const Control = () => null;')
    assert plan(host, refs=['/components/Control.tsx'])['status'] == 'authorized'
    assert host.active.component_basis_hashes[0][0] == 'src/agent-ui/components/Control.tsx'


def test_prepare_tool_returns_actionable_diagnostic_then_accepts_refreshed_evidence(host):
    tool = create_prepare_ui_plugin_development_tool(host)
    arguments = dict(workKind='create-plugin', targetPluginId='business-notes',
                     desiredOutcome='业务备注', missingCapabilities=['备注'],
                     deliveryContract={'capability': '备注', 'renderingCategory': 'panel',
                                       'placement': 'panel', 'lifecycle': 'memory',
                                       'dependencies': [], 'verificationMethod': 'runtime'})
    rejected = json.loads(tool.invoke(arguments))
    assert rejected['ok'] is False
    assert 'componentBasisRefs' in rejected['error']['message']
    accepted = json.loads(tool.invoke({**arguments, 'componentBasisRefs': ['src/App.tsx']}))
    assert accepted['ok'] is True


def test_conditional_reuse_does_not_require_new_plugin_ui_evidence(host):
    host.intent = 'conditional'
    host.record_discovery(plugin_inventory_complete=True, source_inventory_complete=True,
                          source_plugin_ids=['business-notes'])
    assert plan(host)['status'] == 'reuse-existing'
    assert host.active is None


def test_adapt_component_retains_existing_basis_and_freshness_contract(host):
    plan(host, refs=['src/App.tsx'], work_kind='adapt-component')
    host.mark_skill_loaded()
    host.require_create('business-notes')
    (host.project_root / 'src/App.tsx').write_text('changed')
    with pytest.raises(PluginDevelopmentError, match='刷新开发方案'):
        host.require_create('business-notes')


def test_unrelated_source_change_does_not_invalidate_ui_basis(host):
    plan(host, refs=['src/App.tsx'])
    host.mark_skill_loaded()
    (host.project_root / 'src/unrelated.ts').write_text('export const unrelated = true;')
    host.require_create('business-notes')
